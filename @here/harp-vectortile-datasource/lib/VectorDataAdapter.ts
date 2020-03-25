/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoBox, TileKey } from "@here/harp-geoutils";

/**
 * The class [[OmvDataAdapter]] prepares protobuf encoded OMV data so they
 * can be processed by [[VectorTileDecoder]].
 */
export interface VectorDataAdapter {
    /**
     * OmvDataAdapter's id.
     */
    id: string;

    /**
     * Checks if the given data can be processed by this OmvDataAdapter.
     *
     * @param data The raw data to adapt.
     */
    canProcess(data: ArrayBufferLike | {}): boolean;

    /**
     * Process the given raw data.
     *
     * @param data The raw data to process.
     * @param tileKey The TileKey of the enclosing Tile.
     * @param geoBox The GeoBox of the enclosing Tile.
     */
    process(data: ArrayBufferLike | {}, tileKey: TileKey, geoBox: GeoBox): void;
}
