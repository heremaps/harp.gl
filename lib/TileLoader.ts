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

import { CancellationToken, CancellationException } from "@here/fetch";
import { TileLoaderState, Tile } from "@here/mapview";
import { TileDecoder, DecodedTile } from "@here/datasource-protocol";
import { LoggerManager } from "@here/utils";

const logger = LoggerManager.instance.create('TileLoader');

import { DataProvider } from "./DataProvider";

export class TileLoader {
    private loadCancellationToken = new CancellationToken();
    private decodeCancellationToken?: CancellationToken;

    public state: TileLoaderState = TileLoaderState.Initialized;
    public error?: Error;
    private payload?: ArrayBufferLike;

    private donePromise?: Promise<TileLoaderState>
    private resolveDonePromise?: (state: TileLoaderState) => void;

    constructor(
        private tile: Tile,
        private dataProvider: DataProvider,
        private tileDecoder: TileDecoder
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
            return Promise.resolve(this.state)
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

    private ensureLoadingStarted() {

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

    private doStartLoad() {
        const myLoadCancellationToken = this.loadCancellationToken;
        this.dataProvider.getTile(this.tile.tileKey, this.loadCancellationToken)
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
            })

        if (!this.donePromise) {
            this.donePromise = new Promise<TileLoaderState>((resolve, reject) => {
                this.resolveDonePromise = resolve;
            })
        }
        this.state = TileLoaderState.Loading;
    }

    private onLoaded(payload: ArrayBufferLike) {
        this.state = TileLoaderState.Loaded;
        this.payload = payload;

        if (payload.byteLength === 0) {
            // empty tiles are traditionally ignored and don't need decode
            this.tile.forceHasGeometry(true);
            this.onDone(TileLoaderState.Ready);
            return;
        }

        // TBD: we might susspend decode if tile is not visible ... ?
        this.startDecodeTile();
    }

    private startDecodeTile() {
        const payload = this.payload;
        if (payload === undefined) {
            console.error('invalid state, cannot start decode without loaded tile');
            return;
        }

        this.state = TileLoaderState.Decoding;
        this.payload = undefined;

        // Save our cancallation point, so we can be reliably cancelled by any subsequent decode
        // attempts
        const myCancellationPoint = new CancellationToken();
        this.decodeCancellationToken = myCancellationPoint;

        const dataSource = this.tile.dataSource;
        this.tileDecoder.decodeTile(
            payload,
            this.tile.tileKey,
            dataSource.name,
            dataSource.projection
        )
            .then(decodedTile => {
                if (myCancellationPoint.isCancelled) {
                    // next our flow is canceled, silently return
                    return;
                }

                this.onDecoded(decodedTile);
            })
            .catch(error => {
                if (error instanceof CancellationException) {
                    // next our flow is canceled, silently return
                    return;
                }
                this.onError(error);
            });

    }

    private onDecoded(decodedTile: DecodedTile) {

        this.tile.setDecodedTile(decodedTile);

        this.tile.dataSource.requestUpdate();

        this.onDone(TileLoaderState.Ready);
    }

    private cancelDecoding() {

        if (this.decodeCancellationToken !== undefined) {
            // we should cancel any decodes already in progress!
            this.decodeCancellationToken.cancel();
            this.decodeCancellationToken = undefined;
        }
    }

    private onDone(doneState: TileLoaderState) {
        if (this.resolveDonePromise) {
            this.resolveDonePromise(doneState);
            this.resolveDonePromise = undefined;
            this.donePromise = undefined;
        }
        this.state = doneState;
    }

    private onError(error: Error) {
        const dataSource = this.tile.dataSource;
        logger.error(
            `[${dataSource.name}]: failed to load tile ${this.tile.tileKey.toHereTile()}`,
            error
        );

        this.error = error;

        this.onDone(TileLoaderState.Failed);
    }
}
