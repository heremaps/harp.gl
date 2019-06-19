/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { DecodedTile } from "@here/harp-datasource-protocol";
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
     * Start with or continue with loading geometry. Called repeatedly until `isFinished` is `true`.
     */
    update(): void;

    /**
     * Dispose of any resources.
     */
    dispose(): void;
}

/**
 * Simplest implementation of a [[TileGeometryLoader]]. It loads all geometry in a single step.
 */
export class SimpleTileGeometryLoader implements TileGeometryLoader {
    private m_decodedTile?: DecodedTile;
    private m_isFinished: boolean = false;

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

    update(): void {
        if (this.m_decodedTile === undefined && this.m_tile.decodedTile !== undefined) {
            this.setDecodedTile(this.m_tile.decodedTile);
            this.prepareForRender();
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
    private prepareForRender() {
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

            const geometryCreator = new TileGeometryCreator();

            geometryCreator.initDecodedTile(decodedTile);

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
