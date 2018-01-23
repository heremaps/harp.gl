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

import { TileKey, Projection } from "@here/geoutils";
import {
    DecodedTileMessageName,
    DecodedTile, isDecodeTileRequest, DecodeTileRequest,
    isRequestMessage, ResponseMessage,
    isConfigurationMessage, ConfigurationMessage,
    InitializedMessage,
    Theme, ThemeEvaluator, getProjection
} from "@here/datasource-protocol";

declare let self: Worker;

export interface WorkerResponse {
    response: any;
    buffers?: ArrayBufferLike[];
}

export abstract class WorkerClient {
    private themeEvaluators: Map<string, ThemeEvaluator> = new Map();
    public theme: Theme;

    constructor(public readonly serviceId: string) {

        self.addEventListener("message", this.onMessage.bind(this));

        const isInitializedMessage: InitializedMessage = {
            type: DecodedTileMessageName.Initialized,
            service: serviceId,
        }
        self.postMessage(isInitializedMessage);
    }

    onMessage(message: any) {
        if (typeof message.data.service !== "string" || message.data.service !== this.serviceId)
            return;

        try {
            if (isRequestMessage(message.data)) {
                const request = message.data;
                this.handleRequest(request.request)
                    .then((response) => {
                        const message: ResponseMessage = {
                            service: this.serviceId,
                            type: DecodedTileMessageName.Response,
                            messageId: request.messageId,
                            response: response.response
                        };
                        self.postMessage(message, response.buffers);
                    })
                    .catch((error) => {
                        const message: ResponseMessage = {
                            service: this.serviceId,
                            type: DecodedTileMessageName.Response,
                            messageId: request.messageId,
                            error: error.toString()
                        };
                        self.postMessage(message);
                    });
            } else if (isConfigurationMessage(message.data)) {
                this.handleConfigurationEvent(message.data)
            } else {
                console.log(`WorkerClient[${this.serviceId}]: invalid message ${message.type}`);
            }
        } catch (err) {
            console.log(`WorkerClient[${this.serviceId}]: unhandled exception when ` +
                        `handling ${message.type}`);
        }
    }

    handleRequest(request: any): Promise<WorkerResponse> {
        if (isDecodeTileRequest(request)) {
            return new Promise<WorkerResponse>((resolve) => {
                resolve(this.handleDecodeTileRequest(request))
            });
        } else {
            const errorMsg = `WorkerClient[${this.serviceId}]: invalid request '${request.type}'`;
            console.log(errorMsg);
            return Promise.reject(new Error(errorMsg));
        }
    }

    /**
     * Decodes the given payload.
     *
     * @param tileKey The TileKey
     * @param projection The Projection used to convert geo coordinates to world coordinates.
     * @param data The payload to decode.
     */
    abstract decodeTile(data: ArrayBufferLike, tileKey: TileKey, dataSourceName: string, projection: Projection): DecodedTile;

    handleDecodeTileRequest(request: DecodeTileRequest): WorkerResponse {
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);
        const decodedTile = this.decodeTile(request.data, tileKey, request.dataSourceName, projection);

        const buffers: ArrayBufferLike[] = [];

        decodedTile.geometries.forEach(geom => {
            geom.vertexAttributes.forEach(attr => buffers.push(attr.buffer));

            if (geom.index)
                buffers.push(geom.index.buffer);
        });
        return { response: decodedTile, buffers };
    }

    handleConfigurationEvent(message: ConfigurationMessage) {
        this.theme = message.theme;
        this.themeEvaluators.clear();
    }

    getThemeEvalator(dataSourceName: string): ThemeEvaluator {
        let te = this.themeEvaluators.get(dataSourceName);
        if (te === undefined) {
            te = new ThemeEvaluator(this.theme, dataSourceName);
            this.themeEvaluators.set(dataSourceName, te);
        }
        return te;
    }
}
