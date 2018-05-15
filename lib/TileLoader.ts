/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { DecodedTile, ITileDecoder, TileInfo } from "@here/datasource-protocol";
import { CancellationException, CancellationToken } from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { DataSource, Tile, TileLoaderState } from "@here/mapview";
import { LoggerManager } from "@here/utils";

import { DataProvider } from "./DataProvider";

const logger = LoggerManager.instance.create('TileLoader');

export class TileLoader {

    state: TileLoaderState = TileLoaderState.Initialized;
    error?: Error;
    payload?: ArrayBufferLike;
    decodedTile?: DecodedTile;

    protected loadCancellationToken = new CancellationToken();
    protected decodeCancellationToken?: CancellationToken;
    protected donePromise?: Promise<TileLoaderState>;
    protected resolveDonePromise?: (state: TileLoaderState) => void;

    constructor(
        protected dataSource: DataSource,
        protected tileKey: TileKey,
        protected dataProvider: DataProvider,
        protected tileDecoder: ITileDecoder
    ) {
    }

    loadAndDecode(): Promise<TileLoaderState> {
        switch (this.state) {
            case TileLoaderState.Loading:
                return this.donePromise!;

            case TileLoaderState.Disposed:
                logger.warn('cannot load in disposed state');
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

    waitSettled() {
        if (!this.donePromise) {
            return Promise.resolve(this.state);
        }
        return this.donePromise;
    }

    cancel() {
        switch (this.state) {
            case TileLoaderState.Disposed:
                // prevent accidental escape from disposed state
                logger.warn('attempting to cancel disposed TileLoader');
                return;

            case TileLoaderState.Loading:
                this.loadCancellationToken.cancel();
                this.loadCancellationToken = new CancellationToken();
                break;

            case TileLoaderState.Decoding:
                if (this.decodeCancellationToken) {
                    this.decodeCancellationToken.cancel();
                    this.decodeCancellationToken = undefined;
                }
                break;
        }

        this.onDone(TileLoaderState.Canceled);
    }

    dispose() {
        if (this.state !== TileLoaderState.Disposed) {
            this.cancel();
            this.state = TileLoaderState.Disposed;
        }
    }

    isFinished() {
        return (
            this.state === TileLoaderState.Ready ||
            this.state === TileLoaderState.Canceled ||
            this.state === TileLoaderState.Failed
        );
    }

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
                logger.info('reusing already started load operation');
                return;

            case TileLoaderState.Decoding:
                this.cancelDecoding();
                this.doStartLoad();
                return;

            case TileLoaderState.Disposed:
                logger.warn('cannot load in disposed state');
                return;
        }
    }

    protected doStartLoad() {
        const myLoadCancellationToken = this.loadCancellationToken;
        this.dataProvider.getTile(this.tileKey, this.loadCancellationToken)
            .then((payload) => {
                if (myLoadCancellationToken.isCancelled) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    throw new CancellationException();
                }
                this.onLoaded(payload);
            })
            .catch(error => {
                if (error instanceof CancellationException) {
                    return;
                }
                this.onError(error);
            });

        if (!this.donePromise) {
            this.donePromise = new Promise<TileLoaderState>((resolve, reject) => {
                this.resolveDonePromise = resolve;
            });
        }
        this.state = TileLoaderState.Loading;
    }

    protected onLoaded(payload: ArrayBufferLike) {
        this.state = TileLoaderState.Loaded;
        this.payload = payload;

        if (payload.byteLength === 0) {
            this.onDone(TileLoaderState.Ready);
            return;
        }

        // TBD: we might susspend decode if tile is not visible ... ?
        this.startDecodeTile();
    }

    protected startDecodeTile() {
        const payload = this.payload;
        if (payload === undefined) {
            logger.error('TileLoader#startDecodeTile: Cannot decode without payload');
            return;
        }

        this.state = TileLoaderState.Decoding;
        this.payload = undefined;

        // Save our cancellation point, so we can be reliably cancelled by any subsequent decode
        // attempts
        const myCancellationPoint = new CancellationToken();
        this.decodeCancellationToken = myCancellationPoint;

        const dataSource = this.dataSource;
        this.tileDecoder.decodeTile(
            payload,
            this.tileKey,
            dataSource.name,
            dataSource.projection
        )
            .then(decodedTile => {
                if (myCancellationPoint.isCancelled) {
                    // our flow is cancelled, silently return
                    return;
                }

                this.onDecoded(decodedTile);
            })
            .catch(error => {
                if (error instanceof CancellationException) {
                    // our flow is cancelled, silently return
                    return;
                }
                this.onError(error);
            });
    }

    protected onDecoded(decodedTile: DecodedTile) {

        this.decodedTile = decodedTile;
        this.onDone(TileLoaderState.Ready);
    }

    protected cancelDecoding() {

        if (this.decodeCancellationToken !== undefined) {
            // we should cancel any decodes already in progress!
            this.decodeCancellationToken.cancel();
            this.decodeCancellationToken = undefined;
        }
    }

    protected onDone(doneState: TileLoaderState) {
        if (this.resolveDonePromise) {
            this.resolveDonePromise(doneState);
            this.resolveDonePromise = undefined;
            this.donePromise = undefined;
        }
        this.state = doneState;
    }

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

export class TileInfoLoader extends TileLoader {

    tileInfo?: TileInfo;

    protected startDecodeTile() {
        const payload = this.payload;
        if (payload === undefined) {
            logger.error('TileInfoLoader#startDecodeTile: Cannot decode without payload');
            return;
        }

        this.state = TileLoaderState.Decoding;
        this.payload = undefined;

        // Save our cancellation point, so we can be reliably cancelled by any subsequent decode
        // attempts
        const myCancellationPoint = new CancellationToken();
        this.decodeCancellationToken = myCancellationPoint;

        const dataSource = this.dataSource;
        this.tileDecoder.getTileInfo(
            payload,
            this.tileKey,
            dataSource.name,
            dataSource.projection
        )
            .then(tileInfo => {
                if (myCancellationPoint.isCancelled) {
                    // our flow is cancelled, silently return
                    return;
                }
                this.tileInfo = tileInfo;

                this.onDone(TileLoaderState.Ready);
            })
            .catch(error => {
                if (error instanceof CancellationException) {
                    // our flow is cancelled, silently return
                    return;
                }
                this.onError(error);
            });
    }
}
