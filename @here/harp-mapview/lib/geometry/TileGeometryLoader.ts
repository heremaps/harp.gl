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
    isTextTechnique,
    Technique
} from "@here/harp-datasource-protocol";
import { PerformanceTimer } from "@here/harp-utils";

import { PerformanceStatistics } from "../Statistics";
import { Tile } from "../Tile";
import { TileGeometryCreator } from "./TileGeometryCreator";

/**
 * Loads the geometry for its [[Tile]]. Derived classes allow for different loading strategies.
 */
export interface TileGeometryLoader {
    /**
     * The [[Tile]] this `TileGeometryLoader` is managing.
     */
    tile: Tile;

    /**
     * `True` if all geometry of the `Tile` has been loaded and the loading process is finished.
     */
    isFinished: boolean;

    /**
     * `True` if the basic geometry has been loaded, and the `Tile` is ready  for display.
     */
    basicGeometryLoaded: boolean;

    /**
     * `True` if all geometry of the `Tile` has been loaded.
     */
    allGeometryLoaded: boolean;

    /**
     * The kinds of geometry stored in this [[Tile]].

     */
    availableGeometryKinds: GeometryKindSet | undefined;

    /**
     * Start with or continue with loading geometry. Called repeatedly until `isFinished` is `true`.
     */
    update(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void;

    /**
     * Dispose of any resources.
     */
    dispose(): void;
}

export namespace TileGeometryLoader {
    /**
     * Make sure that all technique have their geometryKind set, either from the theme or their
     * default value.
     *
     * Also gather set of the [[GeometryKind]]s found in the techniques and return it.
     *
     * @param {DecodedTile} decodedTile
     * @returns {GeometryKindSet} The set of kinds used in the decodeTile.
     */
    export function prepareDecodedTile(decodedTile: DecodedTile): GeometryKindSet {
        const foundSet: GeometryKindSet = new GeometryKindSet();

        for (const technique of decodedTile.techniques) {
            let geometryKind = technique.kind;

            // Set default kind based on technique.
            if (geometryKind === undefined) {
                geometryKind = setDefaultGeometryKind(technique);
            }

            if (Array.isArray(geometryKind)) {
                geometryKind = new GeometryKindSet(geometryKind);
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

    /**
     * Make sure that the technique has its geometryKind set, either from the theme or their default
     * value.
     *
     * @param {Technique} technique
     */
    export function setDefaultGeometryKind(technique: Technique): GeometryKind | GeometryKindSet {
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

        return geometryKind;
    }
}

/**
 * Simplest implementation of a [[TileGeometryLoader]]. It loads all geometry in a single step.
 */
export class SimpleTileGeometryLoader implements TileGeometryLoader {
    private m_decodedTile?: DecodedTile;
    private m_isFinished: boolean = false;
    private m_availableGeometryKinds: GeometryKindSet | undefined;

    constructor(private m_tile: Tile) {}

    get tile(): Tile {
        return this.m_tile;
    }

    get isFinished(): boolean {
        return this.m_isFinished;
    }

    get basicGeometryLoaded(): boolean {
        return this.m_tile.hasGeometry;
    }

    get allGeometryLoaded(): boolean {
        return this.m_isFinished;
    }

    setDecodedTile(decodedTile: DecodedTile) {
        this.m_decodedTile = this.m_tile.decodedTile;
    }

    get availableGeometryKinds(): GeometryKindSet | undefined {
        return this.m_availableGeometryKinds;
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
        this.m_tile.loadingFinished();
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
                        // tslint:disable-next-line: max-line-length
                        `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} col=${tile.tileKey.column} row=${tile.tileKey.row} DISCARDED - invisible`
                    );
                }
                return;
            }
            let now = 0;
            if (stats.enabled) {
                now = PerformanceTimer.now();
            }

            const geometryCreator = TileGeometryCreator.instance;

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
                    // tslint:disable-next-line: max-line-length
                    `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} col=${tile.tileKey.column} row=${tile.tileKey.row}`
                );
            }
            this.finish();
            tile.dataSource.requestUpdate();
        }, 0);
    }
}
