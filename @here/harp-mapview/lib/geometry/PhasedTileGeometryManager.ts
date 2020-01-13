/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind, GeometryKindSet } from "@here/harp-datasource-protocol";

import { MapView } from "../MapView";
import { Tile } from "../Tile";
import { Phase, PhasedTileGeometryLoader } from "./PhasedTileGeometryLoader";
import { TileGeometryManagerBase } from "./TileGeometryManager";

/**
 * The default phases to load geometry.
 */
const DefaultPhases: Phase[] = [
    [GeometryKind.Background, GeometryKind.Terrain, GeometryKind.Area, GeometryKind.Border],
    [GeometryKind.Line],
    [GeometryKind.Building],
    [GeometryKind.Label],
    [GeometryKind.All]
];

// FIXME: This should (always) be the first phase, no?
const DefaultBasicGeometryKinds: GeometryKindSet = new GeometryKindSet(DefaultPhases[0]);

/**
 * Manages the loading of [[Tile]] geometry in phases.
 */
export class PhasedTileGeometryManager extends TileGeometryManagerBase {
    private m_maxUpdatedTilePerFrame = 5;
    private m_loadPhaseDefinitions: Phase[] = DefaultPhases;
    private m_basicGeometryKinds: GeometryKindSet = DefaultBasicGeometryKinds;

    /**
     * Creates an instance of PhasedTileGeometryManager. Keeps the reference to the [[MapView]].
     *
     * @param {MapView} mapView
     */
    constructor(mapView: MapView) {
        super(mapView);
    }

    /** @override */
    initTile(tile: Tile): void {
        if (tile.dataSource.useGeometryLoader) {
            tile.tileGeometryLoader = new PhasedTileGeometryLoader(
                tile,
                this.m_loadPhaseDefinitions,
                this.m_basicGeometryKinds
            );
        }
    }

    /** @override */
    updateTiles(tiles: Tile[]): void {
        let needUpdate = this.mapView.isDynamicFrame
            ? this.updateSomeTiles(tiles)
            : this.updateAllTilesTogether(tiles);

        if (this.m_tileUpdateCallback) {
            for (const tile of tiles) {
                this.m_tileUpdateCallback(tile);
            }
        }

        // updateTileObjectVisibility() has always to be called.
        needUpdate = this.updateTileObjectVisibility(tiles) || needUpdate;

        if (needUpdate || !this.checkTilesFinished(tiles)) {
            this.mapView.update();
        }
    }

    private checkTilesFinished(tiles: Tile[]): boolean {
        for (const tile of tiles) {
            const phasedGeometryLoader = tile.tileGeometryLoader as PhasedTileGeometryLoader;
            if (phasedGeometryLoader !== undefined && !phasedGeometryLoader.allGeometryLoaded) {
                return false;
            }
        }
        return true;
    }

    /**
     * Update the tiles during dynamic frames. Number of tiles to update may be limited.
     *
     * @param {Tile[]} tiles
     */
    private updateSomeTiles(tiles: Tile[]): boolean {
        let numTilesUpdated = 0;

        for (const tile of tiles) {
            const phasedGeometryLoader = tile.tileGeometryLoader as PhasedTileGeometryLoader;

            if (phasedGeometryLoader !== undefined) {
                if (
                    phasedGeometryLoader.update(
                        this.enableFilterByKind ? this.enabledGeometryKinds : undefined,
                        this.enableFilterByKind ? this.disabledGeometryKinds : undefined
                    )
                ) {
                    numTilesUpdated++;
                    if (
                        this.m_maxUpdatedTilePerFrame > 0 &&
                        numTilesUpdated >= this.m_maxUpdatedTilePerFrame
                    ) {
                        break;
                    }
                }
            }
        }
        return numTilesUpdated > 0;
    }

    /**
     * Update the tiles during static frames. Before advancing to the next phase, any tiles lagging
     * behind are allowed to catch up to their next phase. Only then all tiles will advance to the
     * next phase together.
     *
     * @param {Tile[]} tiles
     */
    private updateAllTilesTogether(tiles: Tile[]): boolean {
        let lowestPhase: number | undefined;
        let needUpdate = false;

        for (const tile of tiles) {
            const phasedGeometryLoader = tile.tileGeometryLoader as PhasedTileGeometryLoader;

            if (
                phasedGeometryLoader !== undefined &&
                (lowestPhase === undefined || phasedGeometryLoader.currentPhase < lowestPhase)
            ) {
                lowestPhase = phasedGeometryLoader.currentPhase;
            }
        }

        if (lowestPhase !== undefined && lowestPhase < this.m_loadPhaseDefinitions.length) {
            const nextPhase = lowestPhase + 1;
            needUpdate = this.updateTilesIfNeeded(tiles, nextPhase);
        }
        return needUpdate;
    }

    /**
     * Update the tiles during static frames only if their phase is lower than the `toPhase`.
     *
     * @param {Tile[]} tiles
     */
    private updateTilesIfNeeded(tiles: Tile[], toPhase: number): boolean {
        let needUpdate = false;

        for (const tile of tiles) {
            const phasedGeometryLoader = tile.tileGeometryLoader as PhasedTileGeometryLoader;
            if (phasedGeometryLoader !== undefined) {
                if (
                    phasedGeometryLoader.updateToPhase(
                        toPhase,
                        this.enableFilterByKind ? this.enabledGeometryKinds : undefined,
                        this.enableFilterByKind ? this.disabledGeometryKinds : undefined
                    )
                ) {
                    needUpdate = true;
                }
            }
        }
        return needUpdate;
    }
}
