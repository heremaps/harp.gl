/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    GeometryKind,
    GeometryKindSet,
    isLineMarkerTechnique,
    isPoiTechnique,
    isTextTechnique,
    Technique
} from "@here/harp-datasource-protocol";
import { PerformanceTimer } from "@here/harp-utils";

import { PerformanceStatistics } from "../Statistics";
import { Tile } from "../Tile";
import { TileGeometryCreator } from "./TileGeometryCreator";
import { TileGeometryLoader } from "./TileGeometryLoader";

/**
 * Describes the kinds of geometry that should be loaded in a single phase.
 */
export type Phase = GeometryKind[];

/**
 * The `PhasedTileGeometryLoader` loads the geometry of a [[Tile]] using a list of [[Phase]]s.
 *
 */
export class PhasedTileGeometryLoader implements TileGeometryLoader {
    private m_decodedTile?: DecodedTile;
    private m_isFinished: boolean = false;
    private m_availableGeometryKinds: GeometryKindSet | undefined;
    private m_geometryKindsLoaded: GeometryKindSet = new GeometryKindSet();
    private m_currentPhaseIndex = 0;

    /**
     * Creates an instance of PhasedTileGeometryLoader of a [[Tile]]. It stores the phases in which
     * its geometry should be created.
     *
     * @param {Tile} m_tile Tile the loader manages.
     * @param {Phase[]} m_loadPhaseDefinitions The definitions of the loading phases.
     * @param {GeometryKindSet} m_basicGeometryKinds The set of [[GeometryKind]] s that have to be
     *      created before the [[Tile]] is made visible.
     */
    constructor(
        private m_tile: Tile,
        private m_loadPhaseDefinitions: Phase[],
        private m_basicGeometryKinds: GeometryKindSet
    ) {}

    /**
     * The [[Tile]] this loader is managing.
     */
    get tile(): Tile {
        return this.m_tile;
    }

    /**
     * The index into the array of loading phases.
     */
    get currentPhase(): number {
        return this.m_currentPhaseIndex;
    }

    /**
     * The number of phases defined.
     */
    get numberOfPhases(): number {
        return this.m_loadPhaseDefinitions.length;
    }

    /**
     * The set of [[GeometryKind]]s already created in this [[Tile]].
     */
    get geometryKindsCreated(): GeometryKindSet {
        return this.m_geometryKindsLoaded;
    }

    /**
     * The set of [[GeometryKind]]s available in this [[Tile]].
     */
    get availableGeometryKinds(): GeometryKindSet | undefined {
        return this.m_availableGeometryKinds;
    }

    /**
     * Returns `true` if all basic [[GeometryKind]]s have been loaded. The set of basic
     * [[GeometryKind]]s is defined in the constructor of `PhasedTileGeometryLoader`.
     */
    get basicGeometryLoaded(): boolean {
        for (const kind of this.m_basicGeometryKinds) {
            if (!this.m_geometryKindsLoaded.has(kind)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Returns `true` if all [[GeometryKind]]s have been loaded.
     */
    get allGeometryLoaded(): boolean {
        return this.currentPhase >= this.m_loadPhaseDefinitions.length;
    }

    /**
     * Set the [[DecodedTile]] of the tile. Is called after the decoded tile has been loaded, and
     * prepares its content for later processing in the 'updateXXX' methods.
     *
     * @param {DecodedTile} decodedTile The decoded tile with the flat geometry data belonging to
     *      this tile.
     * @returns {DecodedTile} The processed decoded tile.
     */
    setDecodedTile(decodedTile: DecodedTile): DecodedTile {
        this.m_decodedTile = decodedTile;
        this.m_currentPhaseIndex = 0;
        this.m_geometryKindsLoaded.clear();

        if (this.m_decodedTile !== undefined) {
            this.m_availableGeometryKinds = TileGeometryLoader.prepareDecodedTile(
                this.m_decodedTile
            );
        }
        return this.m_decodedTile;
    }

    /**
     * Update the tile to have all the content in its decoded tile. Load phases will be ignored.
     *
     * @param {(GeometryKindSet | undefined)} enabledKinds The [[GeometryKind]]s that should be
     *      enabled.
     * @param {(GeometryKindSet | undefined)} disabledKinds The [[GeometryKind]]s that should be
     *      disabled.
     * @returns {boolean} `true` if actual geometry has been created.
     */
    updateCompletely(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): boolean {
        return this.update(enabledKinds, disabledKinds, true);
    }

    /**
     * Update the tile to the specified phase (index). All intermediate phases between the current
     * and the specified phase will be processed.
     *
     * @param toPhase A value between 0 and `numberOfPhases`.
     * @param {(GeometryKindSet | undefined)} enabledKinds The [[GeometryKind]]s that should be
     *      enabled.
     * @param {(GeometryKindSet | undefined)} disabledKinds The [[GeometryKind]]s that should be
     *      disabled.
     * @returns {boolean} `true` if `updateToPhase` was successful.
     */
    updateToPhase(
        toPhase: number,
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): boolean {
        let didUpdate = false;
        toPhase = Math.min(toPhase, this.numberOfPhases);
        while (this.currentPhase < toPhase) {
            if (!this.update(enabledKinds, disabledKinds)) {
                break;
            }
            didUpdate = true;
        }
        return didUpdate;
    }

    /**
     * Create all geometries in the current phase, or ignore the phases and create all remaining
     * geometries if `doFullUpdate` is `true`.
     *
     * @param {(GeometryKindSet | undefined)} enabledKinds The [[GeometryKind]]s that should be
     *      enabled.
     * @param {(GeometryKindSet | undefined)} disabledKinds The [[GeometryKind]]s that should be
     *      disabled.
     * @param doFullUpdate If a value of `true` is specified, the current phase is ignored and all
     *      remaining geometries are created.
     * @returns {boolean} `true` if `update` was successful. If `currentPhase` is smaller than
     *      `numberOfPhases`, `update` can be called again. If `false` is returned, another call to
     *      `update` is not required.
     */
    update(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined,
        doFullUpdate: boolean = false
    ): boolean {
        const tile = this.tile;
        const loadPhaseDefinitions = this.m_loadPhaseDefinitions;

        if (!tile.dataSource.cacheable) {
            this.m_currentPhaseIndex = loadPhaseDefinitions.length;
            return false;
        }

        let decodedTile = this.m_decodedTile;
        const currentPhase = this.currentPhase;

        // First time this tile is handled:
        if (decodedTile === undefined && tile.decodedTile !== undefined) {
            decodedTile = this.setDecodedTile(tile.decodedTile);
            TileGeometryCreator.instance.processTechniques(tile, enabledKinds, disabledKinds);
            tile.clear();
        }

        if (decodedTile === undefined || currentPhase >= this.numberOfPhases) {
            return false;
        }

        const geometryCreator = TileGeometryCreator.instance;

        const stats = PerformanceStatistics.instance;
        let now = 0;

        if (stats.enabled) {
            now = PerformanceTimer.now();
        }

        if (doFullUpdate) {
            geometryCreator.createAllGeometries(tile, decodedTile);

            // Mark it as finished.
            this.m_currentPhaseIndex = loadPhaseDefinitions.length;
        } else {
            const currentPhaseDefinition = loadPhaseDefinitions[currentPhase];

            for (const kind of currentPhaseDefinition) {
                this.createKind(geometryCreator, kind);
            }
        }

        if (stats.enabled) {
            stats.currentFrame.addValue(
                "geometry.geometryCreationTime",
                PerformanceTimer.now() - now
            );
        }

        if (this.nextPhase() === undefined) {
            // All done, update the stats
            if (stats.enabled) {
                const currentFrame = stats.currentFrame;

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
                currentFrame.addValue(
                    "geometryCount.numPathGeometries",
                    decodedTile.pathGeometries !== undefined ? decodedTile.pathGeometries.length : 0
                );
                currentFrame.addMessage(
                    `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} ` +
                        `col=${tile.tileKey.column} row=${tile.tileKey.row}`
                );
            }

            this.finish();
        }
        return true;
    }

    get isFinished(): boolean {
        return this.m_isFinished;
    }

    dispose(): void {
        this.m_decodedTile = undefined;
    }

    reset(): void {
        this.m_decodedTile = undefined;
        this.m_isFinished = false;
        this.m_availableGeometryKinds = undefined;
        this.m_geometryKindsLoaded.clear();
        this.m_currentPhaseIndex = 0;
    }

    private finish() {
        this.m_decodedTile = undefined;
        this.m_tile.loadingFinished();
        this.m_tile.removeDecodedTile();
        this.m_isFinished = true;
    }

    /**
     * Increment the current phase to activate the next phase of geometries.
     *
     * @returns {(number | undefined)} The index into the now active current pase, or `undefined` if
     *      the last phase has been reached.
     */
    private nextPhase(): number | undefined {
        if (this.m_currentPhaseIndex < this.m_loadPhaseDefinitions.length) {
            this.m_currentPhaseIndex++;
        }

        return this.m_currentPhaseIndex < this.m_loadPhaseDefinitions.length
            ? this.m_currentPhaseIndex
            : undefined;
    }

    /**
     * Create all geometries of the specified [[GeometryKind]] `kindToCreate`.
     *
     * @param {TileGeometryCreator} geometryCreator
     * @param {GeometryKind} kindToCreate
     */
    private createKind(geometryCreator: TileGeometryCreator, kindToCreate: GeometryKind): void {
        if (this.m_geometryKindsLoaded.has(kindToCreate)) {
            return;
        }
        this.m_geometryKindsLoaded.add(kindToCreate);

        const tile = this.tile;
        const decodedTile = this.m_decodedTile;

        if (decodedTile !== undefined) {
            const filter = (technique: Technique): boolean => {
                if (technique.enabled === false) {
                    return false;
                }

                const techniqueKind = technique.kind;

                // All kinds are allowed, except those which are explicitly disabled.
                if (kindToCreate === GeometryKind.All) {
                    return true;
                }

                if (techniqueKind instanceof Set) {
                    const techniqueKinds = techniqueKind as GeometryKindSet;

                    // Check if that technique fits the expected kindToCreate.
                    return techniqueKinds.has(kindToCreate);
                } else {
                    return techniqueKind === kindToCreate;
                }
            };

            geometryCreator.createObjects(tile, decodedTile, filter);

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

            // TextElements do not get their geometry created by Tile, but are managed on a
            // higher level.
            geometryCreator.createTextElements(tile, decodedTile, textFilter);

            geometryCreator.preparePois(tile, decodedTile);
        }
    }
}
