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
import { TileGeometryLoader } from "./TileGeometryLoader";

export type PhaseList = GeometryKind[];

/**
 *
 *
 */
export class PhasedTileGeometryLoader implements TileGeometryLoader {
    private m_decodedTile?: DecodedTile;
    private m_isFinished: boolean = false;
    private m_availableGeometryKinds: GeometryKindSet | undefined;
    private m_geometryKindsLoaded: GeometryKindSet = new Set();
    private m_loadPhaseDefinitions: PhaseList[];
    private m_currentPhaseIndex = 0;

    constructor(
        private m_tile: Tile,
        loadPhaseDefinitions: PhaseList[],
        private m_basicGeometryKinds: GeometryKindSet
    ) {
        this.m_loadPhaseDefinitions = loadPhaseDefinitions;
    }

    get currentPhase(): number {
        return this.m_currentPhaseIndex;
    }

    nextPhase(): number | undefined {
        if (this.m_currentPhaseIndex < this.m_loadPhaseDefinitions.length) {
            this.m_currentPhaseIndex++;
        }

        return this.m_currentPhaseIndex < this.m_loadPhaseDefinitions.length
            ? this.m_currentPhaseIndex
            : undefined;
    }

    get numberOfPhases(): number {
        return this.m_loadPhaseDefinitions.length;
    }

    get geometryKindsCreated(): GeometryKindSet {
        return this.m_geometryKindsLoaded;
    }

    get availableGeometryKinds(): GeometryKindSet | undefined {
        return this.m_availableGeometryKinds;
    }

    get basicGeometryLoaded(): boolean {
        for (const kind of this.m_basicGeometryKinds) {
            if (!this.m_geometryKindsLoaded.has(kind)) {
                return false;
            }
        }
        return true;
    }

    get allGeometryLoaded(): boolean {
        return this.currentPhase >= this.m_loadPhaseDefinitions.length;
    }

    get tile(): Tile {
        return this.m_tile;
    }

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

    updateCompletely(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): boolean {
        return this.update(enabledKinds, disabledKinds, true);
    }

    updateToPhase(
        toPhase: number,
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): boolean {
        let didUpdate = false;
        while (this.currentPhase < toPhase) {
            didUpdate = this.update(enabledKinds, disabledKinds);
            if (!didUpdate) {
                break;
            }
        }
        return didUpdate;
    }

    update(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined,
        doFullUpdate: boolean = false
    ): boolean {
        let decodedTile = this.m_decodedTile;
        const loadPhaseDefinitions = this.m_loadPhaseDefinitions;
        const currentPhase = this.currentPhase;
        const tile = this.tile;

        if (!tile.dataSource.cacheable) {
            this.m_currentPhaseIndex = loadPhaseDefinitions.length;
            return false;
        }

        // First time this tile is handled:
        if (decodedTile === undefined && tile.decodedTile !== undefined) {
            decodedTile = this.setDecodedTile(tile.decodedTile);
            this.processTechniques(enabledKinds, disabledKinds);
        }

        if (decodedTile === undefined || currentPhase >= this.numberOfPhases) {
            return false;
        }

        const geometryCreator = new TileGeometryCreator();

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
                currentFrame.addMessage(
                    `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} col=${
                        tile.tileKey.column
                    } row=${tile.tileKey.row}`
                );
            }

            this.finish();
        }
        return true;
    }

    getTextElementPriorities(): number[] | undefined {
        if (this.m_decodedTile === undefined) {
            return undefined;
        }

        const priorities: Set<number> = new Set();
        for (const technique of this.m_decodedTile.techniques) {
            if (technique.name !== "text") {
                continue;
            }
            priorities.add(technique.priority !== undefined ? technique.priority : 0);
        }
        const prioritiesArray = Array.from(priorities);
        return prioritiesArray.sort((a: number, b: number) => {
            return b - a;
        });
    }

    get isFinished(): boolean {
        return this.m_isFinished;
    }

    dispose(): void {
        this.m_decodedTile = undefined;
    }

    protected createKind(geometryCreator: TileGeometryCreator, kindToCreate: GeometryKind): void {
        if (this.m_geometryKindsLoaded.has(kindToCreate)) {
            return;
        }
        this.m_geometryKindsLoaded.add(kindToCreate);

        const tile = this.tile;
        const decodedTile = this.m_decodedTile;

        if (decodedTile !== undefined) {
            if (!tile.hasGeometry) {
                geometryCreator.createBackground(tile);
            }

            const filter = (technique: Technique): boolean => {
                if (technique.enabled !== true) {
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

            // const textPriorities = this.getTextElementPriorities();

            // TextElements do not get their geometry created by Tile, but are managed on a
            // higher level.
            geometryCreator.createTextElements(tile, decodedTile, textFilter);

            geometryCreator.preparePois(tile, decodedTile);
        }
    }

    protected processTechniques(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void {
        const decodedTile = this.m_decodedTile;

        if (decodedTile === undefined) {
            return;
        }

        for (const technique of decodedTile.techniques) {
            // Make sure that all technique have their geometryKind set, either from the Theme or
            // their default value.
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
        }

        // Speedup and simplify following code: Test all techniques if they intersect with
        // enabledKinds and disabledKinds, in which case they are flagged. The disabledKinds can be
        // ignored hereafter.
        const geometryCreator = new TileGeometryCreator();
        geometryCreator.initDecodedTile(decodedTile, enabledKinds, disabledKinds);
    }

    private finish() {
        this.m_decodedTile = undefined;
        this.m_tile.removeDecodedTile();
        this.m_isFinished = true;
    }
}
