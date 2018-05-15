/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import {
    ConfigurationMessage,
    DecodeTileRequest,
    getProjection,
    isConfigurationMessage,
    isDecodeTileRequest,
    isTileInfoRequest,
    ITileDecoder,
    TileInfoRequest
} from "@here/datasource-protocol";
import { TileKey } from "@here/geoutils";
import { LoggerManager } from "@here/utils";

import { WorkerService, WorkerServiceResponse } from "./WorkerService";

const logger = LoggerManager.instance.create("TileDecoderService");

export class TileDecoderService extends WorkerService {
    /**
     * Start a [[TileDecoderService]] with a given decoder.
     *
     * @param serviceId Service id.
     * @param decoder   [[TileDecoder]] instance.
     */
    static start(serviceId: string, decoder: ITileDecoder) {
        return new TileDecoderService(serviceId, decoder);
    }

    constructor(readonly serviceId: string, private readonly m_decoder: ITileDecoder) {
        super(serviceId);
        this.m_decoder.connect();
    }

    handleDecodeTileRequest(request: DecodeTileRequest): Promise<WorkerServiceResponse> {
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);

        return this.m_decoder
            .decodeTile(request.data, tileKey, request.dataSourceName, projection)
            .then(decodedTile => {
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

                return {
                    response: decodedTile,
                    transferList
                };
            });
    }

    handleTileInfoRequest(request: TileInfoRequest): Promise<WorkerServiceResponse> {
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);

        return this.m_decoder
            .getTileInfo(request.data, tileKey, request.dataSourceName, projection)
            .then(tileInfo => {
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

    handleConfigurationMessage(message: ConfigurationMessage) {
        this.m_decoder.configure(message.theme, message.options);
    }

    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        if (isDecodeTileRequest(request)) {
            return new Promise<WorkerServiceResponse>(resolve => {
                resolve(this.handleDecodeTileRequest(request));
            });
        } else if (isTileInfoRequest(request)) {
            return new Promise<WorkerServiceResponse>(resolve => {
                resolve(this.handleTileInfoRequest(request));
            });
        } else {
            return super.handleRequest(request);
        }
    }

    protected handleMessage(message: any) {
        if (isConfigurationMessage(message)) {
            this.handleConfigurationMessage(message);
        } else {
            logger.error(`[${this.serviceId}]: invalid message ${message.type}`);
        }
    }
}
