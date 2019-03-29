/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    GeometryKind,
    GeometryKindSet,
    isDashedLineTechnique,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isFillTechnique,
    isLineMarkerTechnique,
    isLineTechnique,
    isPoiTechnique,
    isSegmentsTechnique,
    isSolidLineTechnique,
    isTextTechnique
} from "@here/harp-datasource-protocol";
import { PerformanceTimer } from "@here/harp-utils";

import { PerformanceStatistics } from "../Statistics";
import { Tile } from "../Tile";
import { TileGeometryCreator } from "./TileGeometryCreator";

export interface TileGeometryLoader {
    isFinished: boolean;
    tile: Tile;
    basicGeometryLoaded: boolean;
    allGeometryLoaded: boolean;
    availableGeometryKinds: GeometryKindSet | undefined;
    update(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void;
    dispose(): void;
}

export namespace TileGeometryLoader {
    /**
     * Make sure that all technique have their geometryKind set, either from the theme or their
     * default value.
     *
     * Also gather set of the [[GeometryKind]]s found in the techniques and return it.
     *
     * @export
     * @param {DecodedTile} decodedTile
     * @returns {GeometryKindSet} The set of kinds used in the decodeTile.
     */
    export function prepareDecodedTile(decodedTile: DecodedTile): GeometryKindSet {
        const foundSet: GeometryKindSet = new Set();

        for (const technique of decodedTile.techniques) {
            let geometryKind = technique.kind;

            // Set default kind based on technique.
            if (geometryKind === undefined) {
                if (isFillTechnique(technique)) {
                    geometryKind = GeometryKind.Area;
                } else if (
                    isLineTechnique(technique) ||
                    isDashedLineTechnique(technique) ||
                    isSolidLineTechnique(technique) ||
                    isSegmentsTechnique(technique) ||
                    isExtrudedLineTechnique(technique)
                ) {
                    geometryKind = GeometryKind.Line;
                } else if (isExtrudedPolygonTechnique(technique)) {
                    geometryKind = GeometryKind.Building;
                } else if (
                    isPoiTechnique(technique) ||
                    isLineMarkerTechnique(technique) ||
                    isTextTechnique(technique)
                ) {
                    geometryKind = GeometryKind.Label;
                } else {
                    geometryKind = GeometryKind.All;
                }

                technique.kind = geometryKind;
            }

            if (Array.isArray(geometryKind)) {
                geometryKind = new Set(geometryKind);
            }

            if (geometryKind instanceof Set) {
                for (const kind of geometryKind) {
                    foundSet.add(kind);
                }
            } else {
                foundSet.add(geometryKind);
            }
        }
        return foundSet;
    }
}

export class SimpleTileGeometryLoader implements TileGeometryLoader {
    private m_decodedTile?: DecodedTile;
    private m_isFinished: boolean = false;
    private m_availableGeometryKinds: GeometryKindSet | undefined;

    constructor(private m_tile: Tile) {}

    get tile(): Tile {
        return this.m_tile;
    }

    get basicGeometryLoaded(): boolean {
        return this.m_tile.hasGeometry;
    }

    get allGeometryLoaded(): boolean {
        return this.m_isFinished;
    }

    get isFinished(): boolean {
        return this.m_isFinished;
    }

    get availableGeometryKinds(): GeometryKindSet | undefined {
        return this.m_availableGeometryKinds;
    }

    setDecodedTile(decodedTile: DecodedTile) {
        this.m_decodedTile = this.m_tile.decodedTile;
        if (this.m_decodedTile !== undefined) {
            this.m_availableGeometryKinds = TileGeometryLoader.prepareDecodedTile(
                this.m_decodedTile
            );
        }
    }

    update(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void {
        if (this.m_decodedTile === undefined && this.m_tile.decodedTile !== undefined) {
            this.setDecodedTile(this.m_tile.decodedTile);
            this.prepareForRender(enabledKinds, disabledKinds);
            this.finish();
        }
    }

    dispose(): void {
        this.m_decodedTile = undefined;
    }

    private finish() {
        this.m_tile.removeDecodedTile();
        this.m_isFinished = true;
    }

    /**
     * Called by [[VisibleTileSet]] to mark that [[Tile]] is visible and it should prepare geometry.
     */
    private prepareForRender(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ) {
        // If the tile is not ready for display, or if it has become invisible while being loaded,
        // for example by moving the camera, the tile is not finished and its geometry is not
        // created. This is an optimization for fast camera movements and zooms.
        const tile = this.tile;
        const decodedTile = this.m_decodedTile;
        this.m_decodedTile = undefined;
        if (decodedTile === undefined || tile.disposed || !tile.isVisible) {
            return;
        }
        setTimeout(() => {
            const stats = PerformanceStatistics.instance;
            // If the tile has become invisible while being loaded, for example by moving the
            // camera, the tile is not finished and its geometry is not created. This is an
            // optimization for fast camera movements and zooms.
            if (!tile.isVisible) {
                // Dispose the tile from the visible set, so it can be reloaded properly next time
                // it is needed.
                tile.mapView.visibleTileSet.disposeTile(tile);
                if (stats.enabled) {
                    stats.currentFrame.addMessage(
                        `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} col=${
                            tile.tileKey.column
                        } row=${tile.tileKey.row} DISCARDED - invisible`
                    );
                }
                return;
            }
            let now = 0;
            if (stats.enabled) {
                now = PerformanceTimer.now();
            }

            const geometryCreator = new TileGeometryCreator();

            // Speedup and simplify following code: Test all techniques if they intersect with the
            // disabledKinds, in which case they are flagged. The disabledKinds can be ignored
            // hereafter.
            geometryCreator.initDecodedTile(decodedTile, enabledKinds, disabledKinds);

            geometryCreator.createAllGeometries(tile, decodedTile);

            if (stats.enabled) {
                const geometryCreationTime = PerformanceTimer.now() - now;
                const currentFrame = stats.currentFrame;
                currentFrame.addValue("geometry.geometryCreationTime", geometryCreationTime);
                currentFrame.addValue("geometryCount.numGeometries", decodedTile.geometries.length);
                currentFrame.addValue("geometryCount.numTechniques", decodedTile.techniques.length);
                currentFrame.addValue(
                    "geometryCount.numPoiGeometries",
                    decodedTile.poiGeometries !== undefined ? decodedTile.poiGeometries.length : 0
                );
                currentFrame.addValue(
                    "geometryCount.numTextGeometries",
                    decodedTile.textGeometries !== undefined ? decodedTile.textGeometries.length : 0
                );
                currentFrame.addValue(
                    "geometryCount.numTextPathGeometries",
                    decodedTile.textPathGeometries !== undefined
                        ? decodedTile.textPathGeometries.length
                        : 0
                );
                currentFrame.addMessage(
                    `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} col=${
                        tile.tileKey.column
                    } row=${tile.tileKey.row}`
                );
            }
            this.finish();
            tile.dataSource.requestUpdate();
        }, 0);
    }
}
