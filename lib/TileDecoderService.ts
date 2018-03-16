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

import { WorkerService, WorkerServiceResponse } from "./WorkerService";
import { ITileDecoder, ConfigurationMessage, DecodedTile, isDecodeTileRequest } from "@here/datasource-protocol";
import { TileKey, Projection } from "@here/geoutils";
import { getProjection, DecodeTileRequest, isConfigurationMessage } from "@here/datasource-protocol";
import { LoggerManager } from "@here/utils";

const logger = LoggerManager.instance.create('TileDecoderService');

export class TileDecoderService extends WorkerService {
    constructor(
        public readonly serviceId: string,
        private readonly decoder: ITileDecoder
    ) {
        super(serviceId);
        this.decoder.connect();
    }

    /**
     * Start a [[TileDecoderService]] with a given decoder.
     *
     * @param serviceId Service id.
     * @param decoder   [[TileDecoder]] instance.
     */
    public static start(serviceId: string, decoder: ITileDecoder) {
        return new TileDecoderService(serviceId, decoder);
    }

    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        if (isDecodeTileRequest(request)) {
            return new Promise<WorkerServiceResponse>((resolve) => {
                resolve(this.handleDecodeTileRequest(request))
            });
        } else {
            return super.handleRequest(request)
        }
    }

    protected handleMessage(message: any) {
        if (isConfigurationMessage(message)) {
            this.handleConfigurationMessage(message);
        } else {
            console.error(`[${this.serviceId}]: invalid message ${message.type}`)
        }
    }

    handleDecodeTileRequest(request: DecodeTileRequest): Promise<WorkerServiceResponse> {
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);

        return this.decoder.decodeTile(request.data, tileKey, request.dataSourceName, projection)
            .then((decodedTile) => {
                const transferList: ArrayBuffer[] = [];
                decodedTile.geometries.forEach(geom => {
                    geom.vertexAttributes.forEach(attr => {
                        if (attr.buffer instanceof ArrayBuffer) {
                            transferList.push(attr.buffer)
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

    handleConfigurationMessage(message: ConfigurationMessage) {
        this.decoder.configure(message.theme, message.options);
    }
}
