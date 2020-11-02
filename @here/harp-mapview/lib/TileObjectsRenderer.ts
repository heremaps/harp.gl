/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    Expr,
    getFeatureId,
    getPropertyValue,
    IndexedTechnique,
    MapEnv
} from "@here/harp-datasource-protocol";
import { Object3D, Vector3 } from "three";

import { SolidLineMesh } from "./geometry/SolidLineMesh";
import { MapObjectAdapter } from "./MapObjectAdapter";
import { Tile, TileFeatureData, TileObject } from "./Tile";

/**
 * All objects in fallback tiles are reduced by this amount.
 *
 * @internal
 */
export const FALLBACK_RENDER_ORDER_OFFSET = 20000;

const DEFAULT_STENCIL_VALUE = 1;

export class TileObjectRenderer {
    private readonly m_renderOrderStencilValues = new Map<number, number>();
    // Valid values start at 1, because the screen is cleared to zero
    private m_stencilValue: number = DEFAULT_STENCIL_VALUE;

    constructor(private readonly m_env: MapEnv) {}

    render(tile: Tile, zoomLevel: number, cameraPosition: Vector3, rootNode: Object3D) {
        const worldOffsetX = tile.computeWorldOffsetX();
        if (tile.willRender(zoomLevel)) {
            for (const object of tile.objects) {
                const mapObjectAdapter = MapObjectAdapter.get(object);
                if (!this.processTileObject(tile, object, mapObjectAdapter)) {
                    continue;
                }

                this.updateStencilRef(object);

                object.position.copy(tile.center);
                if (object.displacement !== undefined) {
                    object.position.add(object.displacement);
                }
                object.position.x += worldOffsetX;
                object.position.sub(cameraPosition);
                if (tile.localTangentSpace) {
                    object.setRotationFromMatrix(tile.boundingBox.getRotationMatrix());
                }
                object.frustumCulled = false;

                this.adjustRenderOrderForFallback(object, mapObjectAdapter, tile);
                rootNode.add(object);
            }
            tile.didRender();
        }
    }

    prepareRender() {
        this.m_stencilValue = DEFAULT_STENCIL_VALUE;
        this.m_renderOrderStencilValues.clear();
    }

    private updateStencilRef(object: TileObject) {
        // TODO: acquire a new style value of if transparent
        if (object.renderOrder !== undefined && object instanceof SolidLineMesh) {
            const material = object.material;
            if (Array.isArray(material)) {
                material.forEach(
                    mat => (mat.stencilRef = this.getStencilValue(object.renderOrder))
                );
            } else {
                material.stencilRef = this.getStencilValue(object.renderOrder);
            }
        }
    }

    private allocateStencilValue(renderOrder: number) {
        const stencilValue = this.m_stencilValue++;
        this.m_renderOrderStencilValues.set(renderOrder, stencilValue);
        return stencilValue;
    }

    private getStencilValue(renderOrder: number) {
        return (
            this.m_renderOrderStencilValues.get(renderOrder) ??
            this.allocateStencilValue(renderOrder)
        );
    }

    private adjustRenderOrderForFallback(
        object: TileObject,
        mapObjectAdapter: MapObjectAdapter | undefined,
        tile: Tile
    ) {
        // When falling back to a parent tile (i.e. tile.levelOffset < 0) there will
        // be overlaps with the already loaded tiles. Therefore all (flat) objects
        // in a fallback tile must be shifted, such that their renderOrder is less
        // than the groundPlane that each neighbouring Tile has (it has a renderOrder
        // of -10000, see addGroundPlane in TileGeometryCreator), only then can we be
        // sure that nothing of the parent will be rendered on top of the children,
        // as such, we shift using the FALLBACK_RENDER_ORDER_OFFSET.
        // This does not apply to buildings b/c they are 3d and the overlaps
        // are resolved with a depth prepass. Note we set this always to ensure that if
        // the Tile is used as a fallback, and then used normally, that we have the correct
        // renderOrder.

        if (tile.levelOffset >= 0) {
            if (object._backupRenderOrder !== undefined) {
                // We messed up the render order when this tile was used as fallback.
                // Now we render normally, so restore the original renderOrder.
                object.renderOrder = object._backupRenderOrder;
            }
            return;
        }
        let offset = FALLBACK_RENDER_ORDER_OFFSET;
        const technique = mapObjectAdapter?.technique;
        if (technique?.name === "extruded-polygon") {
            // Don't adjust render order for extruded-polygon b/c it's not flat.
            return;
        }

        if ((technique as any)?._category?.startsWith("road") === true) {
            // Don't adjust render order for roads b/c the outline of the child tile
            // would overlap the outline of the fallback parent.
            // Road geometry would be duplicated but since it's rendered with two passes
            // it would just appear a bit wider. That artefact is not as disturbing
            // as seeing the cap outlines.
            // NOTE: Since our tests do pixel perfect image comparison we also need to add a
            // tiny offset in this case so that the order is well defined.
            offset = 1e-6;
        }

        if (object._backupRenderOrder === undefined) {
            object._backupRenderOrder = object.renderOrder;
        }
        object.renderOrder = object._backupRenderOrder + offset * tile.levelOffset;
    }

    /**
     * Process dynamic updates of [[TileObject]]'s style.
     *
     * @returns `true` if object shall be used in scene, `false` otherwise
     */
    private processTileObject(tile: Tile, object: TileObject, mapObjectAdapter?: MapObjectAdapter) {
        if (!object.visible) {
            return false;
        }
        if (!this.processTileObjectFeatures(tile, object)) {
            return false;
        }

        if (mapObjectAdapter) {
            mapObjectAdapter.ensureUpdated(tile.mapView);
            if (!mapObjectAdapter.isVisible()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Process the features owned by the given [[TileObject]].
     *
     * @param tile - The {@link Tile} owning the [[TileObject]]'s features.
     * @param object - The [[TileObject]] to process.
     * @returns `false` if the given [[TileObject]] should not be added to the scene.
     */
    private processTileObjectFeatures(tile: Tile, object: TileObject): boolean {
        const technique: IndexedTechnique = object.userData.technique;

        if (!technique || technique.enabled === undefined) {
            // Nothing to do, there's no technique.
            return true;
        }

        const feature: TileFeatureData = object.userData.feature;

        if (!feature || !Expr.isExpr(technique.enabled)) {
            return Boolean(getPropertyValue(technique.enabled, this.m_env));
        }

        const { starts, objInfos } = feature;

        if (!Array.isArray(objInfos) || !Array.isArray(starts)) {
            // Nothing to do, the object is missing feature ids and their position
            // in the index buffer.
            return true;
        }

        const geometry: THREE.BufferGeometry | undefined = (object as any).geometry;

        if (!geometry || !geometry.isBufferGeometry) {
            // Nothing to do, the geometry is not a [[THREE.BufferGeometry]]
            // and we can't generate groups.
            return true;
        }

        // ExtrudeBufferGeometry for example doesn't have an index, hence we get the final index
        // from the number of vertices.
        const finalIndex = geometry.getIndex()?.count ?? geometry.attributes.position.count;

        // clear the groups.
        geometry.clearGroups();

        // The offset in the index buffer of the end of the last
        // pushed group.
        let endOfLastGroup: number | undefined;

        objInfos.forEach((properties, featureIndex) => {
            // the id of the current feature.
            const featureId = getFeatureId(properties);

            let enabled = true;

            if (Expr.isExpr(technique.enabled)) {
                // the state of current feature.
                const featureState = tile.dataSource.getFeatureState(featureId);

                // create a new {@link @here/harp-datasource-protocol#Env} that can be used
                // to evaluate expressions that access the feature state.
                const $state = featureState ? new MapEnv(featureState) : null;

                const parentEnv =
                    typeof properties === "object"
                        ? new MapEnv(properties, this.m_env)
                        : this.m_env;

                const env = new MapEnv({ $state }, parentEnv);

                enabled = Boolean(getPropertyValue(technique.enabled, env));
            }

            if (!enabled) {
                // skip this feature, it was disabled.
                return;
            }

            // HARP-12247, geometry with no featureStarts would set start to `undefined`, in this
            // case, `endOfLastGroup` is also undefined (first execution in this loop), so it would
            // try to change the count of a group which hasn't yet been added, `addGroup` wasn't yet
            // called, hence we use the `??` operator and fall back to 0. Because featureStarts are
            // optional, we need to have a fallback.
            const start = starts[featureIndex] ?? 0;
            const end = starts[featureIndex + 1] ?? finalIndex;
            const count = end - start;

            if (start === endOfLastGroup) {
                // extend the last group
                geometry.groups[geometry.groups.length - 1].count += count;
            } else {
                geometry.addGroup(start, count);
            }

            endOfLastGroup = start + count;
        });

        return geometry.groups.length > 0;
    }
}
