/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConfigurationMessage,
    CreateServiceMessage,
    DecodedTile,
    DecodedTileMessageName,
    DecodeTileRequest,
    getProjectionName,
    ITileDecoder,
    Requests,
    StyleSet,
    TileInfo,
    TileInfoRequest,
    ValueMap,
    WORKER_SERVICE_MANAGER_SERVICE_ID
} from "@here/harp-datasource-protocol";
import { Projection, TileKey } from "@here/harp-geoutils";
import { ConcurrentWorkerSet } from "./ConcurrentWorkerSet";

/**
 * Identifier of next decoder worker-service. Used to ensure uniqueness of service ids of decoders
 * dedicated to different datasources.
 */
let nextUniqueServiceId = 0;

/**
 * Decoder based on [[ConcurrentWorkerSet]].
 *
 * Decodes tiles using workers running in separate contexts (also known as `WebWorkers`):
 * - connection establishment,
 * - sends decode requests,
 * - configuration.
 */
export class WorkerBasedDecoder implements ITileDecoder {
    private serviceId: string;
    private m_serviceCreated: boolean = false;

    /**
     * Missing Typedoc
     */
    constructor(
        private readonly workerSet: ConcurrentWorkerSet,
        private readonly decoderServiceType: string
    ) {
        this.workerSet.addReference();
        this.serviceId = `${this.decoderServiceType}-${nextUniqueServiceId++}`;
    }

    /**
     * Dispose of dedicated tile decoder services in workers and remove reference to underlying
     * [[ConcurrentWorkerSet]].
     */
    dispose() {
        if (this.m_serviceCreated) {
            this.workerSet.broadcastMessage({
                type: DecodedTileMessageName.DestroyService,
                service: WORKER_SERVICE_MANAGER_SERVICE_ID
            });
        }

        this.workerSet.removeReference();
    }

    /**
     * Connects to [[WorkerServiceManager]]s in underlying [[ConcurrentWorkerSet]] and creates
     * dedicated [[TileDecoderService]]s in all workers to serve decode requests.
     */
    async connect(): Promise<void> {
        await this.workerSet.connect(WORKER_SERVICE_MANAGER_SERVICE_ID);
        if (!this.m_serviceCreated) {
            const msg: CreateServiceMessage = {
                service: WORKER_SERVICE_MANAGER_SERVICE_ID,
                type: DecodedTileMessageName.CreateService,
                targetServiceType: this.decoderServiceType,
                targetServiceId: this.serviceId
            };
            this.workerSet.broadcastMessage(msg);
            this.m_serviceCreated = true;
        }
    }

    /**
     * Get [[Tile]] from tile decoder service in worker.
     *
     * Invokes [[DecodeTileRequest]] on [[TileDecoderService]] running in worker pool.
     */
    decodeTile(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection
    ): Promise<DecodedTile> {
        const tileKeyCode = tileKey.mortonCode();

        const message: DecodeTileRequest = {
            type: Requests.DecodeTileRequest,
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
        projection: Projection
    ): Promise<TileInfo | undefined> {
        const tileKeyCode = tileKey.mortonCode();

        const message: TileInfoRequest = {
            type: Requests.TileInfoRequest,
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
     * @param styleSet  new [[StyleSet]], undefined means no change
     * @param languages new list of languages
     * @param options   new options, undefined options are not changed
     */
    configure(styleSet?: StyleSet, languages?: string[], options?: ValueMap): void {
        const configurationMessage: ConfigurationMessage = {
            service: this.serviceId,
            type: DecodedTileMessageName.Configuration,
            styleSet,
            options,
            languages
        };

        this.workerSet.broadcastMessage(configurationMessage);
    }
}
