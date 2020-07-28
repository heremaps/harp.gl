/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import "@here/harp-fetch";

import {
    DecodedTile,
    ITileDecoder,
    RequestController,
    TileInfo
} from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { DataSource, ITileLoader, TileLoaderState } from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";

import { DataProvider } from "./DataProvider";

/**
 * Logger to write to console etc.
 */
const logger = LoggerManager.instance.create("TileLoader");

/**
 * The [[TileLoader]] manages the different states of loading and decoding for a [[Tile]]. Used by
 * the [[TileDataSource]].
 */
export class TileLoader implements ITileLoader {
    /**
     * Current state of `TileLoader`.
     */
    state: TileLoaderState = TileLoaderState.Initialized;

    /**
     * Error object if loading or decoding failed.
     */
    error?: Error;

    /**
     * The binary data in form of [[ArrayBufferLike]], or any object.
     */
    payload?: ArrayBufferLike | {};

    /**
     * The result of decoding the `payload`: The [[DecodedTile]].
     */
    decodedTile?: DecodedTile;

    /**
     * The abort controller notifying the [[DataProvider]] to cancel loading.
     */
    protected loadAbortController = new AbortController();

    /**
     * The  notifying the [[ITileDecoder]] to cancel decoding.
     */
    protected requestController?: RequestController;

    /**
     * The promise which is resolved when loading and decoding have finished.
     */
    protected donePromise?: Promise<TileLoaderState>;

    /**
     * The internal function that is called when loading and decoding have finished successfully.
     */
    protected resolveDonePromise?: (state: TileLoaderState) => void;

    /**
     * The internal function that is called when loading and decoding failed.
     */
    protected rejectedDonePromise?: (state: TileLoaderState) => void;

    /**
     * Set up loading of a single [[Tile]].
     *
     * @param dataSource - The [[DataSource]] the tile belongs to.
     * @param tileKey - The quadtree address of a [[Tile]].
     * @param dataProvider - The [[DataProvider]] that retrieves the binary tile data.
     * @param tileDecoder - The [[ITileDecoder]] that decodes the binary tile to a [[DecodeTile]].
     * @param priority - The priority given to the loading job. Highest number will be served first.
     */
    constructor(
        protected dataSource: DataSource,
        protected tileKey: TileKey,
        protected dataProvider: DataProvider,
        protected tileDecoder: ITileDecoder,
        public priority: number
    ) {}

    /**
     * Start loading and/or proceed through the various states of loading of this tile.
     *
     * @returns A promise which resolves the [[TileLoaderState]].
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
                this.startLoading();
                return this.donePromise!;
        }
    }

    /**
     * Return the current state in form of a promise. Caller can then wait for the promise to be
     * resolved.
     *
     * @returns A promise which resolves the current [[TileLoaderState]].
     */
    waitSettled(): Promise<TileLoaderState> {
        if (!this.donePromise) {
            return Promise.resolve(this.state);
        }
        return this.donePromise;
    }

    /**
     * Cancel loading of the [[Tile]].
     * Cancellation token is notified, an internal state is cleaned up.
     */
    cancel() {
        switch (this.state) {
            case TileLoaderState.Loading:
                this.loadAbortController.abort();
                this.loadAbortController = new AbortController();
                break;

            case TileLoaderState.Decoding:
                if (this.requestController) {
                    this.requestController.abort();
                    this.requestController = undefined;
                }
                break;
        }

        this.onDone(TileLoaderState.Canceled);
    }

    /**
     * Return `true` if [[Tile]] is still loading, `false` otherwise.
     */
    get isFinished(): boolean {
        return (
            this.state === TileLoaderState.Ready ||
            this.state === TileLoaderState.Canceled ||
            this.state === TileLoaderState.Failed
        );
    }

    /**
     * Update the priority of this [[Tile]]'s priority. Is effective to sort the decoding requests
     * in the request queue (used during heavy load).
     */
    updatePriority(priority: number): void {
        this.priority = priority;
        if (this.requestController !== undefined) {
            this.requestController.priority = priority;
        }
    }

    /**
     * Start loading. Only call if loading did not start yet.
     */
    protected startLoading() {
        const myLoadCancellationToken = this.loadAbortController.signal;
        this.dataProvider
            .getTile(this.tileKey, myLoadCancellationToken)
            .then(payload => {
                if (myLoadCancellationToken.aborted) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }
                this.onLoaded(payload);
            })
            .catch(error => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                this.onError(error);
            });

        if (this.donePromise === undefined) {
            this.donePromise = new Promise<TileLoaderState>((resolve, reject) => {
                this.resolveDonePromise = resolve;
                this.rejectedDonePromise = reject;
            });
        }
        this.state = TileLoaderState.Loading;
    }

    /**
     * Called when binary data has been loaded. The loading state is now progressing to decoding.
     *
     * @param payload - Binary data in form of [[ArrayBufferLike]], or any object.
     */
    protected onLoaded(payload: ArrayBufferLike | {}) {
        this.state = TileLoaderState.Loaded;
        this.payload = payload;

        const byteLength = (payload as ArrayBufferLike).byteLength;
        if (
            byteLength === 0 ||
            (payload.constructor === Object && Object.keys(payload).length === 0)
        ) {
            // Object is empty
            this.onDone(TileLoaderState.Ready);
            return;
        }

        // TBD: we might suspend decode if tile is not visible ... ?
        this.startDecodeTile();
    }

    /**
     * Start decoding the payload.
     */
    protected startDecodeTile() {
        const payload = this.payload;
        if (payload === undefined) {
            logger.error("TileLoader#startDecodeTile: Cannot decode without payload");
            return;
        }

        this.state = TileLoaderState.Decoding;
        this.payload = undefined;

        // Save our cancellation point, so we can be reliably cancelled by any subsequent decode
        // attempts
        const requestController = new RequestController(this.priority);
        this.requestController = requestController;

        const dataSource = this.dataSource;
        this.tileDecoder
            .decodeTile(payload, this.tileKey, dataSource.projection, requestController)
            .then(decodedTile => {
                if (requestController.signal.aborted) {
                    // our flow is cancelled, silently return
                    return;
                }

                this.onDecoded(decodedTile);
            })
            .catch(error => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    // our flow is cancelled, silently return
                    return;
                }
                this.onError(error);
            });
    }

    /**
     * Called when the decoding is finished, and the [[DecodedTile]] has been created.
     *
     * @param decodedTile - The [[DecodedTile]].
     */
    protected onDecoded(decodedTile: DecodedTile) {
        this.decodedTile = decodedTile;
        this.onDone(TileLoaderState.Ready);
    }

    /**
     * Cancel the decoding process.
     */
    protected cancelDecoding() {
        if (this.requestController !== undefined) {
            // we should cancel any decodes already in progress!
            this.requestController.abort();
            this.requestController = undefined;
        }
    }

    /**
     * Called when loading and decoding has finished successfully. Resolves loading promise if the
     * state is Ready, otherwise it rejects the promise with the supplied state.
     *
     * @param doneState - The latest state of loading.
     */
    protected onDone(doneState: TileLoaderState) {
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
    protected onError(error: Error) {
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

/**
 * Subclass of [[TileLoader]] which is used by [[TileDataSource]] to load the [[TileInfo]] meta
 * data, not the tile data itself.
 */
export class TileInfoLoader extends TileLoader {
    tileInfo?: TileInfo;

    /** @override */
    protected startDecodeTile() {
        const payload = this.payload;
        if (payload === undefined) {
            logger.error("TileInfoLoader#startDecodeTile: Cannot decode without payload");
            return;
        }

        this.state = TileLoaderState.Decoding;
        this.payload = undefined;

        // Save our cancellation point, so we can be reliably cancelled by any subsequent decode
        // attempts
        const requestController = new RequestController(this.priority);
        this.requestController = requestController;

        const dataSource = this.dataSource;
        this.tileDecoder
            .getTileInfo(payload, this.tileKey, dataSource.projection, requestController)
            .then(tileInfo => {
                if (requestController.signal.aborted) {
                    // our flow is cancelled, silently return
                    return;
                }
                this.tileInfo = tileInfo;

                this.onDone(TileLoaderState.Ready);
            })
            .catch(error => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    // our flow is cancelled, silently return
                    return;
                }
                this.onError(error);
            });
    }
}
