/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";

/**
 * Interface for all `DataProvider` subclasses.
 *
 * @remarks
 * The `DataProvider` is an abstraction of the tile
 * loader which is only responsible for loading the data of a specific tile,
 * without any relation to displaying or even decoding the data.
 */
export interface DataProvider {
    /**
     * Connect to the data source. Returns a promise to wait for successful (or failed) connection.
     *
     * @returns A promise which is resolved when the connection has been established.
     */
    connect(): Promise<void>;

    /**
     * Returns `true` if it has been connected successfully.
     */
    ready(): boolean;

    /**
     * Load the data of a {@link @here/map-view@Tile} asynchronously.
     *
     * @param tileKey - Address of a tile.
     * @param abortSignal - Optional AbortSignal to cancel the request.
     * @returns A promise delivering the data as an [[ArrayBufferLike]], or any object.
     */
    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}>;

    /**
     * An event which fires when this `DataProvider` is invalidated.
     *
     * @param listener - A function to call when this `DataProvider` is invalidated.
     * @returns The function to call to unregister the listener from this event.
     *
     * @example
     * ```typescript
     * const dispose = dataProvider.onDidInvalidate?.(() => {
     *     console.log("invalidated");
     * });
     * ```
     */
    onDidInvalidate?(listener: () => void): () => void;
}
