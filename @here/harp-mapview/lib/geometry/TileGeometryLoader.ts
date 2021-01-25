/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DecodedTile,
    GeometryKind,
    GeometryKindSet,
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
import { PerformanceTimer, TaskQueue } from "@here/harp-utils";

import { TileTaskGroups } from "../MapView";
import { PerformanceStatistics } from "../Statistics";
import { Tile } from "../Tile";
import { TileGeometryCreator } from "./TileGeometryCreator";

function addDiscardedTileToStats(tile: Tile) {
    const stats = PerformanceStatistics.instance;
    if (stats.enabled) {
        const name = tile.dataSource.name;
        const level = tile.tileKey.level;
        const col = tile.tileKey.column;
        const row = tile.tileKey.row;
        const reason = tile.disposed ? `disposed` : `invisible`;

        stats.currentFrame.addMessage(
            `Decoded tile: ${name} # lvl=${level} col=${col} row=${row} DISCARDED - ${reason}`
        );
    }
}

/**
 * The state the {@link TileGeometryLoader}.
 */
export enum TileGeometryLoaderState {
    Initialized = 0,
    CreationQueued = 1,
    CreatingGeometry = 2,
    Finished = 3,
    Canceled = 4,
    Disposed = 5
}

/**
 * Loads the geometry for its {@link Tile}. Loads all geometry in a single step.
 * @internal
 */
export class TileGeometryLoader {
    /**
     * Make sure that all technique have their geometryKind set, either from the theme or their
     * default value.
     *
     * Also gather set of the [[GeometryKind]]s found in the techniques and return it.
     *
     * @param {DecodedTile} decodedTile
     * @returns {GeometryKindSet} The set of kinds used in the decodeTile.
     */
    static prepareAvailableGeometryKinds(decodedTile: DecodedTile): GeometryKindSet {
        const foundSet: GeometryKindSet = new GeometryKindSet();

        for (const technique of decodedTile.techniques) {
            const geometryKind = TileGeometryLoader.compileGeometryKind(technique);

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
    static compileGeometryKind(technique: Technique): GeometryKind | GeometryKindSet {
        let geometryKind = technique.kind;

        // Set default kind based on technique.
        if (geometryKind === undefined) {
            if (isFillTechnique(technique)) {
                geometryKind = GeometryKind.Area;
            } else if (
                isLineTechnique(technique) ||
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
        } else if (Array.isArray(geometryKind)) {
            geometryKind = technique.kind = new GeometryKindSet(geometryKind);
        }

        return geometryKind;
    }

    private m_decodedTile?: DecodedTile;
    private m_availableGeometryKinds: GeometryKindSet | undefined;
    private m_enabledKinds: GeometryKindSet | undefined;
    private m_disabledKinds: GeometryKindSet | undefined;
    private m_priority: number = 0;
    private m_state: TileGeometryLoaderState = TileGeometryLoaderState.Initialized;
    private m_finishedPromise: Promise<void>;
    private m_resolveFinishedPromise?: () => void;
    private m_rejectFinishedPromise?: () => void;

    constructor(private readonly m_tile: Tile, private readonly m_taskQueue: TaskQueue) {
        this.m_finishedPromise = new Promise((resolve, reject) => {
            this.m_resolveFinishedPromise = resolve;
            this.m_rejectFinishedPromise = reject;
        });
    }

    set priority(value: number) {
        this.m_priority = value;
    }

    //This is not a getter as it need to be bound to this for the taskqueue
    getPriority(): number {
        return this.m_priority;
    }

    /**
     * The {@link Tile} this `TileGeometryLoader` is managing.
     */
    get tile(): Tile {
        return this.m_tile;
    }

    /**
     * `True` if a decoded Tile is set
     */
    get hasDecodedTile(): boolean {
        return this.m_decodedTile !== undefined;
    }

    /**
     * `True` if all geometry of the `Tile` has been loaded and the loading process is finished.
     */
    get isFinished(): boolean {
        return this.m_state === TileGeometryLoaderState.Finished;
    }

    /**
     * `True` if loader is finished, canceled or disposed.
     */
    get isSettled(): boolean {
        return this.isFinished || this.isCanceled || this.isDisposed;
    }

    /**
     * Returns a promise resolved when this `TileGeometryLoader` is in
     * `TileGeometryLoaderState.Finished` state, or rejected when it's in
     * `TileGeometryLoaderState.Cancelled` or `TileGeometryLoaderState.Disposed` states.
     */
    waitFinished(): Promise<void> {
        return this.m_finishedPromise;
    }

    /**
     * Set the {@link @here/harp-datasource-protocol#DecodedTile} of the tile.
     *
     * @remarks
     * Is called after the decoded tile has been loaded, and
     * prepares its content for later processing in the 'updateXXX' methods.
     *
     * @param {DecodedTile} decodedTile The decoded tile with the flat geometry data belonging to
     *      this tile.
     * @returns {DecodedTile} The processed decoded tile.
     */
    setDecodedTile(decodedTile: DecodedTile): DecodedTile {
        this.m_decodedTile = decodedTile;

        if (this.hasDecodedTile) {
            this.m_availableGeometryKinds = TileGeometryLoader.prepareAvailableGeometryKinds(
                this.m_decodedTile
            );
        }
        return this.m_decodedTile;
    }

    /**
     * The kinds of geometry stored in this {@link Tile}.
     */
    get availableGeometryKinds(): GeometryKindSet | undefined {
        return this.m_availableGeometryKinds;
    }

    /**
     * Start with or continue with loading geometry. Called repeatedly until `isFinished` is `true`.
     */
    update(enabledKinds?: GeometryKindSet, disabledKinds?: GeometryKindSet): void {
        const tile = this.tile;

        // Geometry kinds have changed but some is already created, so reset
        if (this.tile.hasGeometry && !this.compareGeometryKinds(enabledKinds, disabledKinds)) {
            this.reset();
        }

        // First time this tile is handled, or reset has been requested.
        if (
            (this.m_state === TileGeometryLoaderState.Initialized ||
                this.m_state === TileGeometryLoaderState.Canceled) &&
            tile.decodedTile !== undefined
        ) {
            if (this.m_state === TileGeometryLoaderState.Initialized) {
                TileGeometryCreator.instance.processTechniques(tile, enabledKinds, disabledKinds);
                this.setGeometryKinds(enabledKinds, disabledKinds);
                this.setDecodedTile(tile.decodedTile);
            }
            this.queueGeometryCreation(enabledKinds, disabledKinds);
        }
    }

    /**
     * Cancel geometry loading.
     */
    cancel() {
        addDiscardedTileToStats(this.tile);
        this.m_state = TileGeometryLoaderState.Canceled;
        this.m_rejectFinishedPromise?.();
    }

    /**
     * Dispose of any resources.
     */
    dispose(): void {
        addDiscardedTileToStats(this.tile);
        this.clear();
        this.m_state = TileGeometryLoaderState.Disposed;
        this.m_rejectFinishedPromise?.();
    }

    /**
     * Reset the loader to its initial state and cancels any asynchronous work.
     * @remarks
     * This method prepares the loader to reload new geometry. Since the loader does not transition
     * to a final state, the promise returned by {@link TileGeometryLoader.waitFinished} is not
     * settled.
     */
    reset(): void {
        this.clear();

        if (this.isSettled) {
            this.m_finishedPromise = new Promise((resolve, reject) => {
                this.m_resolveFinishedPromise = resolve;
                this.m_rejectFinishedPromise = reject;
            });
        }
        this.m_state = TileGeometryLoaderState.Initialized;
    }

    /**
     * Finish geometry loading.
     */
    finish() {
        this.m_decodedTile = undefined;
        this.m_state = TileGeometryLoaderState.Finished;
        this.m_resolveFinishedPromise?.();
    }

    private clear() {
        this.m_availableGeometryKinds?.clear();
        this.m_enabledKinds?.clear();
        this.m_disabledKinds?.clear();
        this.m_decodedTile = undefined;
    }

    private queueGeometryCreation(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ) {
        if (this.m_state === TileGeometryLoaderState.CreationQueued) {
            return;
        }

        this.m_taskQueue.add({
            execute: this.createGeometry.bind(this, enabledKinds, disabledKinds),
            group: TileTaskGroups.CREATE,
            getPriority: this.getPriority.bind(this),
            isExpired: () => {
                return this.m_state !== TileGeometryLoaderState.CreationQueued;
            },
            estimatedProcessTime: () => {
                //TODO: this seems to be close in many cases, but take some measures to confirm
                return (this.tile.decodedTile?.decodeTime ?? 30) / 6;
            }
        });

        this.m_state = TileGeometryLoaderState.CreationQueued;
    }

    private createGeometry(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ) {
        if (this.m_state === TileGeometryLoaderState.CreatingGeometry) {
            return;
        }
        this.m_state = TileGeometryLoaderState.CreatingGeometry;

        const tile = this.tile;
        const decodedTile = this.m_decodedTile;
        // Just a sanity check that satisfies compiler check below.
        if (decodedTile === undefined) {
            this.finish();
            return;
        }

        const stats = PerformanceStatistics.instance;
        let now = 0;
        if (stats.enabled) {
            now = PerformanceTimer.now();
        }

        const geometryCreator = TileGeometryCreator.instance;

        tile.clear();
        // Set up techniques which should be processed.
        geometryCreator.initDecodedTile(decodedTile, enabledKinds, disabledKinds);
        geometryCreator.createAllGeometries(tile, decodedTile);

        if (stats.enabled) {
            this.addStats(stats, now);
        }
        this.finish();
        tile.dataSource.requestUpdate();
    }

    private addStats(stats: PerformanceStatistics, now: number) {
        const tile = this.tile;
        const decodedTile = this.m_decodedTile;
        if (decodedTile === undefined) {
            return;
        }

        const geometryCreationTime = PerformanceTimer.now() - now;
        const currentFrame = stats.currentFrame;

        // Account for the geometry creation in the current frame.
        currentFrame.addValue("render.fullFrameTime", geometryCreationTime);
        currentFrame.addValue("render.geometryCreationTime", geometryCreationTime);

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
            decodedTile.textPathGeometries !== undefined ? decodedTile.textPathGeometries.length : 0
        );
        currentFrame.addValue(
            "geometryCount.numPathGeometries",
            decodedTile.pathGeometries !== undefined ? decodedTile.pathGeometries.length : 0
        );
        currentFrame.addMessage(
            // tslint:disable-next-line: max-line-length
            `Decoded tile: ${tile.dataSource.name} # lvl=${tile.tileKey.level} col=${tile.tileKey.column} row=${tile.tileKey.row}`
        );
    }

    /**
     * Stores geometry kinds used to load decoded tile geometry.
     *
     * This values are stored to detect geometry kind changes during loading.
     *
     * @param enabledKinds - Set of geometry kinds to be displayed or undefined.
     * @param disabledKinds - Set of geometry kinds that won't be rendered.
     */
    private setGeometryKinds(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): void {
        if (enabledKinds !== undefined) {
            this.m_enabledKinds = Object.assign(
                this.m_enabledKinds ?? new GeometryKindSet(),
                enabledKinds
            );
        }
        if (disabledKinds !== undefined) {
            this.m_disabledKinds = Object.assign(
                this.m_disabledKinds ?? new GeometryKindSet(),
                disabledKinds
            );
        }
    }

    /**
     * Compare enabled and disabled geometry kinds with currently set.
     *
     * Method compares input sets with recently used geometry kinds in performance wise
     * manner, taking special care of undefined and zero size sets.
     *
     * @param enabledKinds - Set of geometry kinds to be displayed or undefined.
     * @param disabledKinds - Set of geometry kinds that won't be rendered.
     * @return `true` only if sets are logically equal, meaning that undefined and empty sets
     * may result in same geometry (techniques kind) beeing rendered.
     */
    private compareGeometryKinds(
        enabledKinds: GeometryKindSet | undefined,
        disabledKinds: GeometryKindSet | undefined
    ): boolean {
        const enabledSame = this.m_enabledKinds === enabledKinds;
        const disabledSame = this.m_disabledKinds === disabledKinds;
        // Same references, no need to compare.
        if (enabledSame && disabledSame) {
            return true;
        }
        const enabledEmpty =
            (this.m_enabledKinds === undefined || this.m_enabledKinds.size === 0) &&
            (enabledKinds === undefined || enabledKinds.size === 0);
        const disabledEmpty =
            (this.m_disabledKinds === undefined || this.m_disabledKinds.size === 0) &&
            (disabledKinds === undefined || disabledKinds.size === 0);

        // We deal only with empty, the same or undefined sets - fast return, no need to compare.
        if (
            (enabledEmpty && disabledEmpty) ||
            (enabledSame && disabledEmpty) ||
            (disabledSame && enabledEmpty)
        ) {
            return true;
        }
        // It is enough that one the the sets are different, try to spot difference otherwise
        // return true. Compare only non-empty sets.
        if (!enabledEmpty) {
            // If one set undefined then other must be non-empty, for sure different.
            if (enabledKinds === undefined || this.m_enabledKinds === undefined) {
                return false;
            }
            // Both defined and non-empty, compare the sets.
            else if (!enabledKinds.has(this.m_enabledKinds)) {
                return false;
            }
        }
        if (!disabledEmpty) {
            // One set defined and non-empty other undefined, for sure different.
            if (disabledKinds === undefined || this.m_disabledKinds === undefined) {
                return false;
            }
            // Both defined and non-empty, compare the sets.
            else if (!disabledKinds.has(this.m_disabledKinds)) {
                return false;
            }
        }
        // No difference found.
        return true;
    }

    /**
     * `True` if TileGeometryLoader was canceled
     */
    private get isCanceled(): boolean {
        return this.m_state === TileGeometryLoaderState.Canceled;
    }

    /**
     * `True` if TileGeometryLoader was disposed
     */
    private get isDisposed(): boolean {
        return this.m_state === TileGeometryLoaderState.Disposed;
    }
}
