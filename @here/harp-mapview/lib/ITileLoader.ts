/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedTile } from "@here/harp-datasource-protocol";

/**
 * The state the {@link ITileLoader}.
 */
export enum TileLoaderState {
    Initialized,
    Loading,
    Loaded,
    Decoding,
    Ready,
    Canceled,
    Failed
}

/**
 * The interface for managing tile loading.
 */
export interface ITileLoader {
    /**
     * Current state of `TileLoader`.
     */
    state: TileLoaderState;

    /**
     * The result of decoding the `payload`: The [[DecodedTile]].
     */
    decodedTile?: DecodedTile;

    /**
     * `true` if [[Tile]] is still loading, `false` otherwise.
     */
    readonly isFinished: boolean;

    /**
     * Priority given to the tile loading task. The greater the number, the higher the priority.
     */
    priority: number;

    /**
     * Start loading and/or proceed through the various states of loading of this tile.
     *
     * @param client - Optional client requesting the load.
     * @returns A promise which resolves the [[TileLoaderState]].
     */
    loadAndDecode(client?: any): Promise<TileLoaderState>;

    /**
     * Return the current state in form of a promise. Caller can then wait for the promise to be
     * resolved.
     *
     * @returns A promise which resolves the current [[TileLoaderState]].
     */
    waitSettled(): Promise<TileLoaderState>;

    /**
     * Cancel loading of the [[Tile]].
     * Cancellation token is notified, an internal state is cleaned up.
     * @param client - Optional client requesting the cancelation. It's expected to match one of
     * the clients that previously called {@link ITileLoader.loadAndDecode}.
     */
    cancel(client?: any): void;
}
