/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";

import { TileKey } from "@here/harp-geoutils";
import { EventDispatcher } from "three";

/**
 * Interface for all `DataProvider` subclasses.
 *
 * @remarks
 * The `DataProvider` is an abstraction of the tile
 * loader which is only responsible for loading the data of a specific tile,
 * without any relation to displaying or even decoding the data.
 */
export abstract class DataProvider extends EventDispatcher {
    private readonly m_clients: Set<Object> = new Set();
    private m_connectPromise: Promise<void> | undefined;

    /**
     * Registers a client to the data provider.
     *
     * @param client - The client to register.
     * @returns Promise to wait for successful (or failed) connection to the data source.
     */
    register(client: Object): Promise<void> {
        if (this.m_clients.size === 0) {
            this.m_connectPromise = this.connect();
        }
        this.m_clients.add(client);
        return this.m_connectPromise!;
    }

    /**
     * Unregisters a client from the data provider.
     *
     * @param client - The client to unregister.
     */
    unregister(client: Object) {
        if (this.m_clients.delete(client) && this.m_clients.size === 0) {
            this.dispose();
        }
    }

    /**
     * Returns `true` if it has been connected successfully.
     */
    abstract ready(): boolean;

    /**
     * Load the data of a {@link @here/map-view@Tile} asynchronously.
     *
     * @param tileKey - Address of a tile.
     * @param abortSignal - Optional AbortSignal to cancel the request.
     * @returns A promise delivering the data as an [[ArrayBufferLike]], or any object.
     */
    abstract getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}>;

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

    /**
     * Connect to the data source. Returns a promise to wait for successful (or failed) connection.
     *
     * @returns A promise which is resolved when the connection has been established.
     */
    protected abstract connect(): Promise<void>;

    /**
     * Destroys this `DataProvider`. Implementations of `DataProvider` must dispose of
     * asynchronous operations and services here.
     */
    protected abstract dispose(): void;
}
