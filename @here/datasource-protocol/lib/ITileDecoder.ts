/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { Projection, TileKey } from "@here/geoutils";
import { DecodedTile } from "./DecodedTile";
import { Theme } from "./Theme";
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
        dataSourceName: string,
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
        dataSourceName: string,
        projection: Projection
    ): Promise<TileInfo | undefined>;

    /**
     * Set decoder configuration.
     *
     * Configuration will take effect for next calls to results of [[decodeTile]],
     * [[decodeThemedTile]].
     *
     * Non-existing (`undefined`) options (including theme) are not changed.
     *
     * @param theme optional, new theme
     * @param languages optional, languge list
     * @param options optional, new options - shape is specific for each decoder
     */
    configure(theme?: Theme, languages?: string[], options?: OptionsMap): void;

    /**
     * Free all resources associated with this decoder.
     *
     * Called by users when decoder is no longer used and all resources must be freed.
     */
    dispose(): void;
}
