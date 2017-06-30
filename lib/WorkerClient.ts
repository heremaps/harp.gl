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

/** @module @here/mapview-decoder **//** */

import { DecodedTile } from "@here/datasource-protocol/lib/DecodedTile";
import { TileKey, Projection } from "@here/geoutils";
import { getProjection, DecodeTileRequest, DecodeTileResponse } from "@here/datasource-protocol";
import { Theme } from "@here/mapview";

declare let self: Worker;

export interface WorkerResponse {
    response: any;
    buffers?: ArrayBuffer[];
}

export abstract class WorkerClient {
    constructor(public readonly id: string, public readonly theme: Theme) {
         self.addEventListener("message", message => {
            if (typeof message.data.type !== "string" || message.data.type !== id)
                return;
            const workerResponse = this.handleEvent(message);
            self.postMessage(workerResponse.response, workerResponse.buffers);
        });
    }

    /**
     * Decodes the given payload.
     *
     * @param tileKey The TileKey
     * @param projection The Projection used to convert geo coordinates to world coordinates.
     * @param data The payload to decode.
     */
    abstract decodeTile(tileKey: TileKey, projection: Projection, data: ArrayBuffer): DecodedTile;

    handleEvent(message: MessageEvent): WorkerResponse {
        const request = message.data as DecodeTileRequest;
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const projection = getProjection(request.projection);
        const decodedTile = this.decodeTile(tileKey, projection, request.data);

        const buffers: ArrayBuffer[] = [];

        decodedTile.geometries.forEach(geom => {
            geom.vertexAttributes.forEach(attr => buffers.push(attr.buffer));

            if (geom.index)
                buffers.push(geom.index.buffer);
        });

        const response: DecodeTileResponse = {
            type: request.type,
            tileKey: request.tileKey,
            decodedTile
        };

        return { response, buffers };
    }
}
