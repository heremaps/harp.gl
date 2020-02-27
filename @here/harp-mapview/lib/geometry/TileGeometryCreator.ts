/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    GeometryKind,
    GeometryKindSet,
    Group,
    IndexedTechnique,
    isLineMarkerTechnique,
    isPoiTechnique,
    isTextTechnique,
    Technique,
    TextGeometry,
    TextPathGeometry
} from "@here/harp-datasource-protocol";
// tslint:disable:max-line-length
import { SphericalGeometrySubdivisionModifier } from "@here/harp-geometry/lib/SphericalGeometrySubdivisionModifier";
import { GeoCoordinates, ProjectionType } from "@here/harp-geoutils";
import { MapMeshBasicMaterial } from "@here/harp-materials";
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";

import { compileTechniques } from "../DecodedTileHelpers";
import { FALLBACK_RENDER_ORDER_OFFSET } from "../MapView";
import { PathBlockingElement } from "../PathBlockingElement";
import { GenericWorldSpaceTechniqueHandler } from "../techniques/GenericWorldSpaceTechniqueHandler";
import { Tile } from "../Tile";
import { TileGeometryLoader } from "./TileGeometryLoader";

const logger = LoggerManager.instance.create("TileGeometryCreator");

/**
 * Parameters that control fading.
 */
export interface FadingParameters {
    fadeNear?: number;
    fadeFar?: number;
}

/**
 * Parameters that control fading for extruded buildings with fading edges.
 */
export interface PolygonFadingParameters extends FadingParameters {
    color?: string | number;
    colorMix?: number;
    lineFadeNear?: number;
    lineFadeFar?: number;
}

/**
 * Support class to create geometry for a [[Tile]] from a [[DecodedTile]].
 */
export class TileGeometryCreator {
    private static m_instance: TileGeometryCreator;

    /**
     * The `instance` of the `TileGeometryCreator`.
     *
     * @returns TileGeometryCreator
     */
    static get instance(): TileGeometryCreator {
        return this.m_instance || (this.m_instance = new TileGeometryCreator());
    }

    /**
     *  Creates an instance of TileGeometryCreator. Access is allowed only through `instance`.
     */
    private constructor() {
        //
    }

    /**
     * Apply `enabledKinds` and `disabledKinds` to all techniques in the `decodedTile`. If a
     * technique is identified as disabled, its property `enabled` is set to `false`.
     *
     * @param decodedTile The decodedTile containing the actual tile map data.
     * @param enabledKinds Optional [[GeometryKindSet]] used to specify which object kinds should be
     *      created.
     * @param disabledKinds Optional [[GeometryKindSet]] used to filter objects that should not be
     *      created.
     */
    initDecodedTile(
        decodedTile: DecodedTile,
        enabledKinds?: GeometryKindSet | undefined,
        disabledKinds?: GeometryKindSet | undefined
    ) {
        for (const technique of decodedTile.techniques) {
            // Already processed
            if (technique.enabled !== undefined) {
                continue;
            }

            // Turn technique.kind from the style, which may be a string or an array of strings,
            // into a GeometryKindSet.
            if (technique.kind !== undefined) {
                if (Array.isArray(technique.kind)) {
                    technique.kind = new GeometryKindSet(technique.kind);
                } else if (typeof technique.kind !== "string") {
                    logger.warn("Technique has unknown type of kind:", technique);
                    technique.kind = undefined;
                }
            }

            // No info about kind, no way to filter it.
            if (
                technique.kind === undefined ||
                (technique.kind instanceof Set && (technique.kind as GeometryKindSet).size === 0)
            ) {
                technique.enabled = true;
                continue;
            }

            // Technique is enabled only if enabledKinds is defined and technique belongs to that set or
            // if that's not the case, disabledKinds must be undefined or technique does not belong to it.
            technique.enabled =
                !(disabledKinds !== undefined && disabledKinds.hasOrIntersects(technique.kind)) ||
                (enabledKinds !== undefined && enabledKinds.hasOrIntersects(technique.kind));
        }
        for (const srcGeometry of decodedTile.geometries) {
            for (const group of srcGeometry.groups) {
                group.createdOffsets = [];
            }
        }

        // compile the dynamic expressions.
        compileTechniques(decodedTile.techniques);
    }

    /**
     * Called after the `Tile` has been decoded. It is required to call `initDecodedTile` before
     * calling this method.
     *
     * @see [[TileGeometryCreator#initDecodedTile]]
     *
     * @param tile The [[Tile]] to process.
     * @param decodedTile The decodedTile containing the actual tile map data.
     */
    createAllGeometries(tile: Tile, decodedTile: DecodedTile) {
        const filter = (technique: Technique): boolean => {
            return technique.enabled !== false;
        };

        if (decodedTile.maxGeometryHeight !== undefined) {
            tile.maxGeometryHeight = decodedTile.maxGeometryHeight;
        }
        this.createObjects(tile, decodedTile, filter);

        this.preparePois(tile, decodedTile);

        // TextElements do not get their geometry created by Tile, but are managed on a
        // higher level.
        const textFilter = (technique: Technique): boolean => {
            if (
                !isPoiTechnique(technique) &&
                !isLineMarkerTechnique(technique) &&
                !isTextTechnique(technique)
            ) {
                return false;
            }
            return filter(technique);
        };
        this.createTextElements(tile, decodedTile, textFilter);

        this.createLabelRejectionElements(tile, decodedTile);

        // HARP-7899, disable ground plane for globe
        if (tile.dataSource.addGroundPlane && tile.projection.type === ProjectionType.Planar) {
            // The ground plane is required for when we change the zoom back and we fall back to the
            // parent, in that case we reduce the renderOrder of the parent tile and this ground
            // place ensures that parent doesn't come through. This value must be above the
            // renderOrder of all objects in the fallback tile, otherwise there won't be a proper
            // covering of the parent tile by the children, hence dividing by 2. To put a bit more
            // concretely, we assume all objects are rendered with a renderOrder between 0 and
            // FALLBACK_RENDER_ORDER_OFFSET / 2, i.e. 10000. The ground plane is put at -10000, and
            // the fallback tiles have their renderOrder set between -20000 and -10000
            TileGeometryCreator.instance.addGroundPlane(tile, -FALLBACK_RENDER_ORDER_OFFSET / 2);
        }
    }

    createLabelRejectionElements(tile: Tile, decodedTile: DecodedTile) {
        if (decodedTile.pathGeometries === undefined) {
            return;
        }
        for (const path of decodedTile.pathGeometries) {
            tile.addBlockingElement(new PathBlockingElement(path.path));
        }
    }

    /**
     * Processes the given tile and assign default values for geometry kinds,
     * render orders and label priorities.
     *
     * @param {Tile} tile
     * @param {(GeometryKindSet | undefined)} enabledKinds
     * @param {(GeometryKindSet | undefined)} disabledKinds
     */
    processTechniques(
        tile: Tile,
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void {
        const decodedTile = tile.decodedTile;

        if (decodedTile === undefined) {
            return;
        }

        this.processPriorities(tile);

        for (const technique of decodedTile.techniques) {
            // Make sure that all technique have their geometryKind set, either from the Theme or
            // their default value.
            if (technique.kind === undefined) {
                TileGeometryLoader.setDefaultGeometryKind(technique);
            }
        }

        // Speedup and simplify following code: Test all techniques if they intersect with
        // enabledKinds and disabledKinds, in which case they are flagged. The disabledKinds can be
        // ignored hereafter.
        this.initDecodedTile(decodedTile, enabledKinds, disabledKinds);
    }

    /**
     * Adds a THREE object to the root of the tile. Sets the owning tiles datasource.name and the
     * tileKey in the `userData` property of the object, such that the tile it belongs to can be
     * identified during picking.
     *
     * @param tile The [[Tile]] to add the object to.
     * @param object The object to add to the root of the tile.
     * @param geometryKind The kind of object. Can be used for filtering.
     */
    registerTileObject(
        tile: Tile,
        object: THREE.Object3D,
        geometryKind: GeometryKind | GeometryKindSet | undefined
    ) {
        if (object.userData === undefined) {
            object.userData = {};
        }
        const userData = object.userData;
        userData.tileKey = tile.tileKey;
        userData.dataSource = tile.dataSource.name;

        userData.kind =
            geometryKind instanceof Set
                ? Array.from((geometryKind as GeometryKindSet).values())
                : Array.isArray(geometryKind)
                ? geometryKind
                : [geometryKind];

        // Force a visibility check of all objects.
        tile.resetVisibilityCounter();
    }

    /**
     * Splits the text paths that contain sharp corners.
     *
     * @param tile The [[Tile]] to process paths on.
     * @param textPathGeometries The original path geometries that may have defects.
     * @param textFilter: Optional filter. Should return true for any text technique that is
     *      applicable.
     */
    prepareTextPaths(
        textPathGeometries: TextPathGeometry[],
        decodedTile: DecodedTile,
        textFilter?: (technique: Technique) => boolean
    ): TextPathGeometry[] {
        const processedPaths = new Array<TextPathGeometry>();
        const newPaths = textPathGeometries.slice();

        while (newPaths.length > 0) {
            const textPath = newPaths.pop();

            if (textPath === undefined) {
                break;
            }

            const technique = decodedTile.techniques[textPath.technique];
            if (
                !isTextTechnique(technique) ||
                (textFilter !== undefined && !textFilter(technique))
            ) {
                continue;
            }

            processedPaths.push(textPath);
        }
        return processedPaths;
    }

    /**
     * Creates [[TextElement]] objects from the decoded tile and list of materials specified. The
     * priorities of the [[TextElement]]s are updated to simplify label placement.
     *
     * @param tile The [[Tile]] to create the testElements on.
     * @param decodedTile The [[DecodedTile]].
     * @param textFilter: Optional filter. Should return true for any text technique that is
     *      applicable.
     */
    createTextElements(
        tile: Tile,
        decodedTile: DecodedTile,
        textFilter?: (technique: Technique) => boolean
    ) {
        function visitObject(object: TextGeometry | TextPathGeometry) {
            if (object.technique === undefined) {
                return;
            }
            const technique = decodedTile.techniques[object.technique];
            if (
                technique.enabled === false ||
                !isTextTechnique(technique) ||
                (textFilter !== undefined && !textFilter(technique))
            ) {
                return;
            }

            const techniqueHandler = tile.techniqueHandlerIndex.getTechniqueHandler(
                technique as IndexedTechnique
            );

            if (techniqueHandler === undefined) {
                return;
            }

            const textElements = techniqueHandler.addScreenSpaceObject(tile, object);
            if (textElements !== undefined) {
                for (const textElement of textElements) {
                    tile.addTextElement(textElement);
                }
            }
        }

        if (decodedTile.textPathGeometries !== undefined) {
            const preparedTextPaths = this.prepareTextPaths(
                decodedTile.textPathGeometries,
                decodedTile
            );
            for (const textPath of preparedTextPaths) {
                visitObject(textPath);
            }
        }

        if (decodedTile.textGeometries !== undefined) {
            for (const text of decodedTile.textGeometries) {
                visitObject(text);
            }
        }

        /**
         * Handled by PoiManager.addPois
         */
        // if (decodedTile.poiGeometries !== undefined) {
        //     for (const textPath of decodedTile.poiGeometries) {
        //         visitObject(textPath);
        //     }
        // }
    }

    /**
     * Creates `Tile` objects from the decoded tile and list of materials specified.
     *
     * @param tile The [[Tile]] to create the geometry on.
     * @param decodedTile The [[DecodedTile]].
     * @param techniqueFilter: Optional filter. Should return true for any technique that is
     *      applicable.
     */
    createObjects(
        tile: Tile,
        decodedTile: DecodedTile,
        techniqueFilter?: (technique: Technique) => boolean
    ) {
        const mergedGroup: Group = { start: 0, count: 0, technique: 0 };

        for (const srcGeometry of decodedTile.geometries) {
            const groups = srcGeometry.groups;
            const groupCount = groups.length;

            for (let groupIndex = 0; groupIndex < groupCount; ) {
                const group = groups[groupIndex++];
                const start = group.start;
                const techniqueIndex = group.technique;
                mergedGroup.start = group.start;
                mergedGroup.technique = techniqueIndex;
                const technique = decodedTile.techniques[techniqueIndex];

                if (
                    group.createdOffsets!.indexOf(tile.offset) !== -1 ||
                    technique.enabled === false ||
                    (techniqueFilter !== undefined && !techniqueFilter(technique))
                ) {
                    continue;
                }

                let count = group.count;
                group.createdOffsets!.push(tile.offset);

                // compress consecutive groups
                for (
                    ;
                    groupIndex < groupCount && groups[groupIndex].technique === techniqueIndex;
                    ++groupIndex
                ) {
                    if (start + count !== groups[groupIndex].start) {
                        break;
                    }

                    count += groups[groupIndex].count;

                    // Mark this group as created, so it does not get processed again.
                    groups[groupIndex].createdOffsets!.push(tile.offset);
                }

                mergedGroup.count = count;

                const techniqueHandler = tile.techniqueHandlerIndex.getTechniqueHandler(
                    technique as IndexedTechnique,
                    GenericWorldSpaceTechniqueHandler
                );

                const newObjects = techniqueHandler.addWorldSpaceObject(
                    tile,
                    srcGeometry,
                    mergedGroup
                );

                for (const obj of newObjects) {
                    tile.objects.push(obj);
                    if (group.renderOrderOffset !== undefined) {
                        obj.renderOrder += group.renderOrderOffset;
                    }

                    this.registerTileObject(tile, obj, technique.kind);
                }
            }
        }
    }

    /**
     * Prepare the [[Tile]]s pois. Uses the [[PoiManager]] in [[MapView]].
     */
    preparePois(tile: Tile, decodedTile: DecodedTile) {
        if (decodedTile.poiGeometries !== undefined) {
            tile.mapView.poiManager.addPois(tile, decodedTile);
        }
    }

    /**
     * Creates and add a background plane for the tile.
     */
    addGroundPlane(tile: Tile, renderOrder: number) {
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const projection = tile.projection;

        const color = mapView.clearColor;
        const tmpV = new THREE.Vector3();

        if (tile.projection.type === ProjectionType.Spherical) {
            const { east, west, north, south } = tile.geoBox;
            const sourceProjection = dataSource.getTilingScheme().projection;
            const g = new THREE.BufferGeometry();
            const posAttr = new THREE.BufferAttribute(
                new Float32Array([
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(south, west), tmpV)
                        .toArray(),
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(south, east), tmpV)
                        .toArray(),
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(north, west), tmpV)
                        .toArray(),
                    ...sourceProjection
                        .projectPoint(new GeoCoordinates(north, east), tmpV)
                        .toArray()
                ]),
                3
            );
            g.setAttribute("position", posAttr);
            g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1));
            const modifier = new SphericalGeometrySubdivisionModifier(
                THREE.MathUtils.degToRad(10),
                sourceProjection
            );
            modifier.modify(g);

            for (let i = 0; i < posAttr.array.length; i += 3) {
                tmpV.set(posAttr.array[i], posAttr.array[i + 1], posAttr.array[i + 2]);
                projection.reprojectPoint(sourceProjection, tmpV, tmpV);
                tmpV.sub(tile.center);
                (posAttr.array as Float32Array)[i] = tmpV.x;
                (posAttr.array as Float32Array)[i + 1] = tmpV.y;
                (posAttr.array as Float32Array)[i + 2] = tmpV.z;
            }
            posAttr.needsUpdate = true;

            const material = new MapMeshBasicMaterial({
                color,
                visible: true,
                depthWrite: true
            });
            const mesh = new THREE.Mesh(g, material);
            mesh.renderOrder = renderOrder;
            this.registerTileObject(tile, mesh, GeometryKind.Background);
            tile.objects.push(mesh);
        } else {
            // Add a ground plane to the tile.
            tile.boundingBox.getSize(tmpV);
            const groundPlane = this.createPlane(
                tmpV.x,
                tmpV.y,
                tile.center,
                color,
                true,
                renderOrder
            );

            this.registerTileObject(tile, groundPlane, GeometryKind.Background);
            tile.objects.push(groundPlane);
        }
    }

    /**
     * Process the given [[Tile]] and assign default values to render orders
     * and label priorities.
     *
     * @param tile The [[Tile]] to process.
     */
    private processPriorities(tile: Tile) {
        const decodedTile = tile.decodedTile;

        if (decodedTile === undefined) {
            return;
        }

        const theme = tile.mapView;

        if (!theme) {
            return;
        }

        const { priorities, labelPriorities } = tile.mapView.theme;

        decodedTile.techniques.forEach(technique => {
            const indexedTechnique = technique as IndexedTechnique;

            if (
                isTextTechnique(technique) ||
                isPoiTechnique(technique) ||
                isLineMarkerTechnique(technique)
            ) {
                // for screen-space techniques the `category` is used to assign
                // priorities.
                if (labelPriorities && typeof indexedTechnique._category === "string") {
                    // override the `priority` when the technique uses `category`.
                    const priority = labelPriorities.indexOf(indexedTechnique._category);
                    if (priority !== -1) {
                        technique.priority = labelPriorities.length - priority;
                    }
                }
            } else if (priorities && indexedTechnique._styleSet !== undefined) {
                // Compute the render order based on the style category and styleSet.
                const computeRenderOrder = (category: string): number | undefined => {
                    const priority = priorities?.findIndex(
                        entry =>
                            entry.group === indexedTechnique._styleSet &&
                            entry.category === category
                    );

                    return priority !== undefined && priority !== -1
                        ? (priority + 1) * 10
                        : undefined;
                };

                if (typeof indexedTechnique._category === "string") {
                    // override the renderOrder when the technique is using categories.
                    const renderOrder = computeRenderOrder(indexedTechnique._category);

                    if (renderOrder !== undefined) {
                        technique.renderOrder = renderOrder;
                    }
                }

                if (typeof indexedTechnique._secondaryCategory === "string") {
                    // override the secondaryRenderOrder when the technique is using categories.
                    const secondaryRenderOrder = computeRenderOrder(
                        indexedTechnique._secondaryCategory
                    );

                    if (secondaryRenderOrder !== undefined) {
                        (technique as any).secondaryRenderOrder = secondaryRenderOrder;
                    }
                }
            }
        });
    }

    /**
     * Create a simple flat plane for a [[Tile]].
     *
     * @param {number} width Width of plane.
     * @param {number} height Height of plane.
     * @param {THREE.Vector3} planeCenter Center of plane.
     * @param {number} colorHex Color of the plane mesh.
     * @param {boolean} isVisible `True` to make the mesh visible.
     * @returns {THREE.Mesh} The created plane.
     */
    private createPlane(
        width: number,
        height: number,
        planeCenter: THREE.Vector3,
        colorHex: number,
        isVisible: boolean,
        renderOrder: number
    ): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(width, height, 1);
        // TODO cache the material HARP-4207
        const material = new MapMeshBasicMaterial({
            color: colorHex,
            visible: isVisible,
            depthWrite: false
        });
        const plane = new THREE.Mesh(geometry, material);
        plane.position.copy(planeCenter);
        // Render before everything else
        plane.renderOrder = renderOrder;
        return plane;
    }
}
