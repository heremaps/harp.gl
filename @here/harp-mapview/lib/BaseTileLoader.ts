/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TileKey } from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";

import { DataSource } from "./DataSource";
import { ITileLoader, TileLoaderState } from "./ITileLoader";

const logger = LoggerManager.instance.create("BaseTileLoader");

/**
 * @internal
 * Base class for tile loaders that provides state handling, request abortion and a load promise.
 */
export abstract class BaseTileLoader implements ITileLoader {
    state: TileLoaderState = TileLoaderState.Initialized;

    /**
     * Error object if loading or decoding failed.
     */
    error?: Error;

    protected m_priority: number = 0;

    /**
     * The abort controller notifying the [[DataProvider]] to cancel loading.
     */
    private loadAbortController = new AbortController();

    /**
     * The promise which is resolved when loading and decoding have finished.
     */
    private donePromise?: Promise<TileLoaderState>;

    /**
     * The internal function that is called when loading and decoding have finished successfully.
     */
    private resolveDonePromise?: (state: TileLoaderState) => void;

    /**
     * The internal function that is called when loading and decoding failed.
     */
    private rejectedDonePromise?: (state: TileLoaderState) => void;

    /**
     * Set up loading of a single [[Tile]].
     *
     * @param dataSource - The [[DataSource]] the tile belongs to.
     * @param tileKey - The quadtree address of a [[Tile]].
     */
    constructor(protected dataSource: DataSource, protected tileKey: TileKey) {}

    /**
     * @override
     */
    get priority(): number {
        return this.m_priority;
    }

    /**
     * @override
     */
    set priority(value: number) {
        this.m_priority = value;
    }

    /**
     * @override
     */
    loadAndDecode(): Promise<TileLoaderState> {
        switch (this.state) {
            case TileLoaderState.Loading:
            case TileLoaderState.Loaded:
            case TileLoaderState.Decoding:
                // tile is already loading
                return this.donePromise!;

            case TileLoaderState.Ready:
            case TileLoaderState.Failed:
            case TileLoaderState.Initialized:
            case TileLoaderState.Canceled:
                // restart loading
                this.load();
                return this.donePromise!;
        }
    }

    /**
     * @override
     */
    waitSettled(): Promise<TileLoaderState> {
        if (!this.donePromise) {
            return Promise.resolve(this.state);
        }
        return this.donePromise;
    }

    /**
     * @override
     */
    cancel(): void {
        if (this.state === TileLoaderState.Loading) {
            this.loadAbortController.abort();
            this.loadAbortController = new AbortController();
        }
        this.cancelImpl();

        this.onDone(TileLoaderState.Canceled);
    }

    /**
     * @override
     */
    get isFinished(): boolean {
        return (
            this.state === TileLoaderState.Ready ||
            this.state === TileLoaderState.Canceled ||
            this.state === TileLoaderState.Failed
        );
    }

    /**
     * Called on load cancelation, may be overriden to extend behaviour.
     */
    protected cancelImpl(): void {}

    /**
     * Called on tile load.
     *
     * @param abortSignal - Signal emitted to abort loading.
     * @param onDone - Callback that must be called once the loading is done.
     * @param onError - Callback that must be called on loading error.
     */
    protected abstract loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void;

    /**
     * Start loading. Only call if loading did not start yet.
     */
    private load() {
        this.loadImpl(
            this.loadAbortController.signal,
            this.onDone.bind(this),
            this.onError.bind(this)
        );

        if (this.donePromise === undefined) {
            this.donePromise = new Promise<TileLoaderState>((resolve, reject) => {
                this.resolveDonePromise = resolve;
                this.rejectedDonePromise = reject;
            });
        }
        this.state = TileLoaderState.Loading;
    }

    /**
     * Called when loading and decoding has finished successfully. Resolves loading promise if the
     * state is Ready, otherwise it rejects the promise with the supplied state.
     *
     * @param doneState - The latest state of loading.
     */
    private onDone(doneState: TileLoaderState) {
        if (this.resolveDonePromise && doneState === TileLoaderState.Ready) {
            this.resolveDonePromise(doneState);
        } else if (this.rejectedDonePromise) {
            this.rejectedDonePromise(doneState);
        }
        this.resolveDonePromise = undefined;
        this.rejectedDonePromise = undefined;
        this.donePromise = undefined;
        this.state = doneState;
    }

    /**
     * Called when loading or decoding has finished with an error.
     *
     * @param error - Error object describing the failing.
     */
    private onError(error: Error) {
        if (this.state === TileLoaderState.Canceled) {
            // If we're canceled, we should simply ignore any state transitions and errors from
            // underlying load/decode ops.
            return;
        }
        const dataSource = this.dataSource;
        logger.error(
            `[${dataSource.name}]: failed to load tile ${this.tileKey.mortonCode()}`,
            error
        );

        this.error = error;

        this.onDone(TileLoaderState.Failed);
    }
}
