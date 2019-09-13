/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Projection, TileKey } from "@here/harp-geoutils";

import { DecodedTile } from "./DecodedTile";
import { Definitions, StyleSet } from "./Theme";
import { TileInfo } from "./TileInfo";
import { OptionsMap, RequestController } from "./WorkerDecoderProtocol";

/**
 * General type decoder which can be used to provide decoded tile data.
 */
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
     * representation of tile's geometry.
     *
     * See [[DecodedTile]].
     */
    decodeTile(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<DecodedTile>;

    /**
     * Get tile info.
     *
     * Get map features metadata associated with tile. See [[TileInfo]].
     */
    getTileInfo(
        data: ArrayBufferLike | {},
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
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
     * @param definitions optional, definitions used to resolve references in `styleSet`
     * @param languages optional, language list
     * @param options optional, new options - shape is specific for each decoder
     */
    configure(
        styleSet?: StyleSet,
        definitions?: Definitions,
        languages?: string[],
        options?: OptionsMap
    ): void;

    /**
     * Free all resources associated with this decoder.
     *
     * Called by users when decoder is no longer used and all resources must be freed.
     */
    dispose(): void;
}
