/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { CancellationToken } from "@here/fetch";
import { TileKey } from "@here/geoutils";

/**
 * Interface for all `DataProvider` subclasses. The `DataProvider` is an abstraction of the tile
 * loader which is only responsible for loading the binary data of a specific tile, without any
 * relation to displaying or even decoding the data.
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
     * Load the data of a [[Tile]] asynchronously in form of an [[ArrayBufferLike]].
     *
     * @param tileKey Address of a tile.
     * @param cancellationToken Optional token to cancel the request.
     * @returns A promise delivering the data as an [[ArrayBufferLike]], or any object.
     */
    getTile(tileKey: TileKey, cancellationToken?: CancellationToken): Promise<ArrayBufferLike | {}>;
}
