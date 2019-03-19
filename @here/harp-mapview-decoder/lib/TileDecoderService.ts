/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    getProjection,
    isStandardTexturedTechnique,
    isTextureBuffer,
    ITileDecoder,
    WorkerDecoderProtocol
} from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";

import { WorkerService, WorkerServiceResponse } from "./WorkerService";

const logger = LoggerManager.instance.create("TileDecoderService");

/**
 * An extension to [[WorkerService]], the `TileDecoderService` implements an asynchronous
 * (message based) service to decode tile content in web workers. The `TileDecoderService` itself
 * lives in the web worker, and communicates with messages by means of a [[ConcurrentWorkerSet]]
 * with the application.
 *
 * The `TileDecoderService` handles a [[DecodeTileRequest]], which contains a tile and its freshly
 * loaded binary data, decodes the content with the [[ITileDecoder]] that the service is configured
 * to use, and sends the data back in form of a [[WorkerServiceResponse]].
 */
export class TileDecoderService extends WorkerService {
    /**
     * Start a [[TileDecoderService]] with a given decoder.
     *
     * @param serviceId Service id. Must be unique.
     * @param decoder   [[TileDecoder]] instance.
     */
    static start(serviceId: string, decoder: ITileDecoder) {
        return new TileDecoderService(serviceId, decoder);
    }

    /**
     * Set up the `TileDecoderService`. The name of the service must be unique
     *
     * @param serviceId Service id. Must be unique.
     * @param m_decoder Decoder to handle the decoding and info requests.
     */
    constructor(readonly serviceId: string, private readonly m_decoder: ITileDecoder) {
        super(serviceId);
        this.m_decoder.connect();
    }

    /**
     * Handle incoming request messages. Identifies message type and processes the request.
     *
     * @param request Message that is either a DecodeTileRequest or a TileInfoRequest.
     * @returns A promise which resolves to a [[WorkerServiceResponse]].
     */
    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        if (WorkerDecoderProtocol.isDecodeTileRequest(request)) {
            return this.handleDecodeTileRequest(request);
        } else if (WorkerDecoderProtocol.isTileInfoRequest(request)) {
            return this.handleTileInfoRequest(request);
        } else {
            return super.handleRequest(request);
        }
    }

    /**
     * Handle incoming configuration message. Configuration message is passed on to decoder.
     *
     * @param request Message of type [[ConfigurationMessage]].
     */
    protected handleMessage(message: any) {
        if (WorkerDecoderProtocol.isConfigurationMessage(message)) {
            this.handleConfigurationMessage(message);
        } else {
            logger.error(`[${this.serviceId}]: invalid message ${message.type}`);
        }
    }

    private handleDecodeTileRequest(
        request: WorkerDecoderProtocol.DecodeTileRequest
    ): Promise<WorkerServiceResponse> {
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);

        return this.m_decoder.decodeTile(request.data, tileKey, projection).then(decodedTile => {
            const transferList: ArrayBuffer[] = [];
            decodedTile.geometries.forEach(geom => {
                geom.vertexAttributes.forEach(attr => {
                    if (attr.buffer instanceof ArrayBuffer) {
                        transferList.push(attr.buffer);
                    }
                });

                if (geom.index && geom.index.buffer instanceof ArrayBuffer) {
                    transferList.push(geom.index.buffer);
                }
            });

            decodedTile.techniques.forEach(technique => {
                if (isStandardTexturedTechnique(technique)) {
                    if (isTextureBuffer(technique.texture)) {
                        if (technique.texture.buffer instanceof ArrayBuffer) {
                            transferList.push(technique.texture.buffer);
                        }
                    }
                }
            });

            return {
                response: decodedTile,
                transferList
            };
        });
    }

    private handleTileInfoRequest(
        request: WorkerDecoderProtocol.TileInfoRequest
    ): Promise<WorkerServiceResponse> {
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);

        return this.m_decoder.getTileInfo(request.data, tileKey, projection).then(tileInfo => {
            const transferList: ArrayBuffer[] =
                tileInfo !== undefined && tileInfo.transferList !== undefined
                    ? tileInfo.transferList
                    : [];
            return {
                response: tileInfo,
                transferList
            };
        });
    }

    private handleConfigurationMessage(message: WorkerDecoderProtocol.ConfigurationMessage) {
        this.m_decoder.configure(message.styleSet, message.languages, message.options);
    }
}
