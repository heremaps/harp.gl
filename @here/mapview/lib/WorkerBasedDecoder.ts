/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import {
    ConfigurationMessage,
    DecodedTile,
    DecodedTileMessageName,
    DecodeTileRequest,
    getProjectionName,
    ITileDecoder,
    Requests,
    Theme,
    TileInfo,
    TileInfoRequest,
    ValueMap
} from "@here/datasource-protocol";
import { Projection, TileKey } from "@here/geoutils";

import { ConcurrentWorkerSet } from "./ConcurrentWorkerSet";

/**
 * Decoder based on [[ConcurrentWorkerSet]].
 *
 * Decodes tiles using workers running in separate contexts (also known as `WebWorkers`):
 * - connection establishment,
 * - sends decode requests,
 * - configuration.
 */
export class WorkerBasedDecoder implements ITileDecoder {
    /**
     * Missing Typedoc
     */
    constructor(
        private readonly workerSet: ConcurrentWorkerSet,
        private readonly serviceId: string
    ) {
        this.workerSet.addReference();
    }

    /**
     * Missing Typedoc
     */
    dispose() {
        this.workerSet.removeReference();
    }

    /**
     * Resolves when all [[TileDecoderService]]s are initialized and connectivity all of them is
     * established
     */
    connect(): Promise<void> {
        return this.workerSet.connect(this.serviceId);
    }

    /**
     * Get [[Tile]] from tile decoder service in worker.
     *
     * Invokes [[DecodeTileRequest]] on [[TileDecoderService]] running in worker pool.
     */
    decodeTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        dataSourceName: string,
        projection: Projection
    ): Promise<DecodedTile> {
        const tileKeyCode = tileKey.mortonCode();

        const message: DecodeTileRequest = {
            type: Requests.DecodeTileRequest,
            dataSourceName,
            tileKey: tileKeyCode,
            data,
            projection: getProjectionName(projection)
        };

        const transferList = data instanceof ArrayBuffer ? [data] : undefined;

        return this.workerSet.invokeRequest(this.serviceId, message, transferList);
    }

    /**
     * Get [[TileInfo]] from tile decoder service in worker.
     *
     * Invokes [[TileInfoRequest]] on [[TileDecoderService]] running in worker pool.
     */
    getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        dataSourceName: string,
        projection: Projection
    ): Promise<TileInfo | undefined> {
        const tileKeyCode = tileKey.mortonCode();

        const message: TileInfoRequest = {
            type: Requests.TileInfoRequest,
            dataSourceName,
            tileKey: tileKeyCode,
            data,
            projection: getProjectionName(projection)
        };

        const transferList = data instanceof ArrayBuffer ? [data] : undefined;
        return this.workerSet.invokeRequest(this.serviceId, message, transferList);
    }

    /**
     * Configure tile decoder service in workers.
     *
     * Broadcasts [[ConfigurationMessage]] to all [[TileDecoderService]]s running in worker pool.
     *
     * @param theme     new theme, undefined means no theme change
     * @param languages new list of languages
     * @param options   new options, undefined options are not changed
     */
    configure(theme?: Theme, languages?: string[], options?: ValueMap): void {
        const configurationMessage: ConfigurationMessage = {
            service: this.serviceId,
            type: DecodedTileMessageName.Configuration,
            theme,
            options,
            languages
        };

        this.workerSet.broadcastMessage(configurationMessage);
    }
}
