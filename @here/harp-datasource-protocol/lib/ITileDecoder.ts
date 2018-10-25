/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Projection, TileKey } from "@here/harp-geoutils";
import { DecodedTile } from "./DecodedTile";
import { StyleSet } from "./Theme";
import { TileInfo } from "./TileInfo";
import { OptionsMap } from "./WorkerDecoderProtocol";

export interface ITileDecoder {
    /**
     * Connect to decoder.
     *
     * Should be implemented by implementations that use special resources that decode jobs like
     * WebWorkers.
     */
    connect(): Promise<void>;

    /**
     * Decode tile into transferrable geometry.
     *
     * Decode raw tile data (encoded with datasource specific encoding) into transferrable
     * reprenstation of tile's geometry.
     *
     * See [[DecodedTile]].
     */
    decodeTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection
    ): Promise<DecodedTile>;

    /**
     * Get tile info.
     *
     * Get map features metadata associated with tile. See [[TileInfo]].
     */
    getTileInfo(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection
    ): Promise<TileInfo | undefined>;

    /**
     * Set decoder configuration.
     *
     * Configuration will take effect for next calls to results of [[decodeTile]],
     * [[decodeThemedTile]].
     *
     * Non-existing (`undefined`) options (including styleSet) are not changed.
     *
     * @param styleSet optional, new style set.
     * @param languages optional, languge list
     * @param options optional, new options - shape is specific for each decoder
     */
    configure(styleSet?: StyleSet, languages?: string[], options?: OptionsMap): void;

    /**
     * Free all resources associated with this decoder.
     *
     * Called by users when decoder is no longer used and all resources must be freed.
     */
    dispose(): void;
}
