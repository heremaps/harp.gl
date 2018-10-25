/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile, ITileDecoder, TileInfo } from "@here/harp-datasource-protocol";
import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";
import { DataSource, TileLoaderState } from "@here/harp-mapview";
import { LoggerManager } from "@here/harp-utils";

import { DataProvider } from "./DataProvider";

const logger = LoggerManager.instance.create("TileLoader");

/**
 * The `TileLoader` manages the different states of loading and decoding for a [[Tile]]. Used by the
 * [[TiledataSource]].
 */
export class TileLoader {
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
    protected decodeAbortController?: AbortController;

    /**
     * The promise which is resolved when loading and decoding have finished.
     */
    protected donePromise?: Promise<TileLoaderState>;

    /**
     * The internal function that is called when loading and decoding have finished.
     */
    protected resolveDonePromise?: (state: TileLoaderState) => void;

    /**
     * Set up loading of a single [[Tile]].
     *
     * @param dataSource The [[DataSource]] the tile belongs to.
     * @param tileKey The quadtree address of a [[Tile]].
     * @param dataProvider The [[DataProvider]] that retrieves the binary tile data.
     * @param tileDecoder The [[ITileDecoder]] that decodes the binary tile to a [[DecodeTile]].
     */
    constructor(
        protected dataSource: DataSource,
        protected tileKey: TileKey,
        protected dataProvider: DataProvider,
        protected tileDecoder: ITileDecoder
    ) {}

    /**
     * Start loading and/or proceed through the various states of loading of this tile.
     *
     * @returns A promise which resolves the [[TileLoaderState]].
     */
    loadAndDecode(): Promise<TileLoaderState> {
        switch (this.state) {
            case TileLoaderState.Loading:
                return this.donePromise!;

            case TileLoaderState.Disposed:
                logger.warn("cannot load in disposed state");
                return Promise.resolve(TileLoaderState.Disposed);

            case TileLoaderState.Ready:
            case TileLoaderState.Failed:
            case TileLoaderState.Initialized:
            case TileLoaderState.Canceled:
                this.ensureLoadingStarted();
                return this.donePromise!;

            case TileLoaderState.Loaded:
                this.startDecodeTile();
                return this.donePromise!;

            case TileLoaderState.Decoding:
                this.cancelDecoding();
                this.ensureLoadingStarted();
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
     * Cancel loading of the [[Tile]]. Cancellation token is notified, an internal state is cleaned
     * up.
     */
    cancel() {
        switch (this.state) {
            case TileLoaderState.Disposed:
                // prevent accidental escape from disposed state
                logger.warn("attempting to cancel disposed TileLoader");
                return;

            case TileLoaderState.Loading:
                this.loadAbortController.abort();
                this.loadAbortController = new AbortController();
                break;

            case TileLoaderState.Decoding:
                if (this.decodeAbortController) {
                    this.decodeAbortController.abort();
                    this.decodeAbortController = undefined;
                }
                break;
        }

        this.onDone(TileLoaderState.Canceled);
    }

    /**
     * Cancel loading and remove all references.
     */
    dispose() {
        if (this.state !== TileLoaderState.Disposed) {
            this.cancel();
            this.state = TileLoaderState.Disposed;
        }
    }

    /**
     * Return `true` if [[Tile]] is still loading, `false` otherwise.
     */
    isFinished(): boolean {
        return (
            this.state === TileLoaderState.Ready ||
            this.state === TileLoaderState.Canceled ||
            this.state === TileLoaderState.Failed
        );
    }

    /**
     * Depending on state: if not loaded yet, make sure it is loading.
     */
    protected ensureLoadingStarted() {
        switch (this.state) {
            case TileLoaderState.Ready:
            case TileLoaderState.Initialized:
            case TileLoaderState.Canceled:
                this.doStartLoad();
                return;

            case TileLoaderState.Loading:
            case TileLoaderState.Loaded:
                // we may reuse already started loading promise
                logger.info("reusing already started load operation");
                return;

            case TileLoaderState.Decoding:
                this.cancelDecoding();
                this.doStartLoad();
                return;

            case TileLoaderState.Disposed:
                logger.warn("cannot load in disposed state");
                return;
        }
    }

    /**
     * Start loading. Only call if loading did not start yet.
     */
    protected doStartLoad() {
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
                if (error.name === "AbortError") {
                    return;
                }
                this.onError(error);
            });

        if (this.donePromise === undefined) {
            this.donePromise = new Promise<TileLoaderState>(resolve => {
                this.resolveDonePromise = resolve;
            });
        }
        this.state = TileLoaderState.Loading;
    }

    /**
     * Called when binary data has been loaded. The loading state is now progressing to decoding.
     *
     * @param payload Binary data in form of [[ArrayBufferLike]], or any object.
     */
    protected onLoaded(payload: ArrayBufferLike | {}) {
        this.state = TileLoaderState.Loaded;
        this.payload = payload;

        if ((payload as ArrayBufferLike).byteLength !== undefined) {
            if ((payload as ArrayBufferLike).byteLength === 0) {
                this.onDone(TileLoaderState.Ready);
                return;
            }
        }
        // Object is empty
        if ((payload as {}) === {}) {
            this.onDone(TileLoaderState.Ready);
            return;
        }

        // TBD: we might susspend decode if tile is not visible ... ?
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
        const myCancellationPoint = new AbortController();
        this.decodeAbortController = myCancellationPoint;

        const dataSource = this.dataSource;
        this.tileDecoder
            .decodeTile(payload, this.tileKey, dataSource.projection)
            .then(decodedTile => {
                if (myCancellationPoint.signal.aborted) {
                    // our flow is cancelled, silently return
                    return;
                }

                this.onDecoded(decodedTile);
            })
            .catch(error => {
                if (error.name === "AbortError") {
                    // our flow is cancelled, silently return
                    return;
                }
                this.onError(error);
            });
    }

    /**
     * Called when the decoding is finished, and the [[DecodedTile]] has been created.
     *
     * @param decodedTile The [[DecodedTile]].
     */
    protected onDecoded(decodedTile: DecodedTile) {
        this.decodedTile = decodedTile;
        this.onDone(TileLoaderState.Ready);
    }

    /**
     * Cancel the decoding process.
     */
    protected cancelDecoding() {
        if (this.decodeAbortController !== undefined) {
            // we should cancel any decodes already in progress!
            this.decodeAbortController.abort();
            this.decodeAbortController = undefined;
        }
    }

    /**
     * Called when loading and decoding has finished successfully. Resolves loading promise.
     *
     * @param doneState The latest state of loading.
     */
    protected onDone(doneState: TileLoaderState) {
        if (this.resolveDonePromise) {
            this.resolveDonePromise(doneState);
            this.resolveDonePromise = undefined;
            this.donePromise = undefined;
        }
        this.state = doneState;
    }

    /**
     * Called when loading or decoding has finished with an error.
     *
     * @param error Error object describing the failing.
     */
    protected onError(error: Error) {
        const dataSource = this.dataSource;
        logger.error(
            `[${dataSource.name}]: failed to load tile ${this.tileKey.toHereTile()}`,
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
        const myCancellationPoint = new AbortController();
        this.decodeAbortController = myCancellationPoint;

        const dataSource = this.dataSource;
        this.tileDecoder
            .getTileInfo(payload, this.tileKey, dataSource.projection)
            .then(tileInfo => {
                if (myCancellationPoint.signal.aborted) {
                    // our flow is cancelled, silently return
                    return;
                }
                this.tileInfo = tileInfo;

                this.onDone(TileLoaderState.Ready);
            })
            .catch(error => {
                if (error.name === "AbortError") {
                    // our flow is cancelled, silently return
                    return;
                }
                this.onError(error);
            });
    }
}
