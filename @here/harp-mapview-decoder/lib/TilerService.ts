/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkerTilerProtocol } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { LoggerManager } from "@here/harp-utils";
import { WorkerService, WorkerServiceResponse } from "./WorkerService";

declare const require: any;
// tslint:disable-next-line:no-var-requires
const geojsonvt = require("geojson-vt");

const logger = LoggerManager.instance.create("TilerService");

/**
 * An extension to [[WorkerService]], the `TilerService` implements an asynchronous (message based)
 * service to tile untiled payloads in web workers. The `TilerService` itself lives in the web
 * worker, and communicates with messages by means of a [[ConcurrentWorkerSet]] with the
 * application.
 *
 * The `TilerService` registers tile indices (parent tile to be subdivided) by handling a
 * [[RegisterIndexRequest]], and can later retrieve tiled payloads from through the [[TileRequest]].
 * The data is sent back in form of a [[WorkerServiceResponse]].
 */
export class TilerService extends WorkerService {
    /**
     * Start a [[TilerService]].
     *
     * @param serviceId Service id. Must be unique.
     */
    static start(serviceId: string) {
        return new TilerService(serviceId);
    }

    private m_tileIndexMap: Map<string, any>;

    /**
     * Set up the `TilerService`. The name of the service must be unique
     *
     * @param serviceId Service id. Must be unique.
     */
    constructor(readonly serviceId: string) {
        super(serviceId);
        this.m_tileIndexMap = new Map();
    }

    /**
     * Handle incoming request messages. Identifies message type and processes the request.
     *
     * @param request [[WorkerTilerProtocol]] request.
     * @returns A promise which resolves to a [[WorkerServiceResponse]].
     */
    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        if (WorkerTilerProtocol.isRegisterIndexRequest(request)) {
            return this.handleRegisterIndexRequest(request);
        } else if (WorkerTilerProtocol.isUpdateIndexRequest(request)) {
            return this.handleUpdateIndexRequest(request);
        } else if (WorkerTilerProtocol.isTileRequest(request)) {
            return this.handleTileRequest(request);
        } else {
            return super.handleRequest(request);
        }
    }

    private async handleTileRequest(
        request: WorkerTilerProtocol.TileRequest
    ): Promise<WorkerServiceResponse> {
        const tileIndex = this.m_tileIndexMap.get(request.index);
        if (tileIndex === undefined) {
            return { response: {} };
        }

        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const tile = tileIndex.getTile(tileKey.level, tileKey.column, tileKey.row);
        return { response: tile || {} };
    }

    private async handleRegisterIndexRequest(
        message: WorkerTilerProtocol.RegisterIndexRequest
    ): Promise<WorkerServiceResponse> {
        const tileIndex = this.m_tileIndexMap.get(message.id);
        if (tileIndex === undefined) {
            await this.writeIndex(message);
        }
        return { response: {} };
    }

    private async handleUpdateIndexRequest(
        message: WorkerTilerProtocol.UpdateIndexRequest
    ): Promise<WorkerServiceResponse> {
        await this.writeIndex(message);
        return { response: {} };
    }

    private async writeIndex(
        message: WorkerTilerProtocol.RegisterIndexRequest | WorkerTilerProtocol.UpdateIndexRequest
    ): Promise<WorkerServiceResponse> {
        let json = message.input;
        if (typeof message.input === "string") {
            const response = await fetch(message.input);
            if (!response.ok) {
                logger.error(`${message.input} Status Text:  ${response.statusText}`);
                return { response: {} };
            }
            json = await response.json();
        }
        const tileIndex = geojsonvt.default(json, {
            maxZoom: 20, // max zoom to preserve detail on
            indexMaxZoom: 5, // max zoom in the tile index
            indexMaxPoints: 100000, // max number of points per tile in the tile index
            tolerance: 3, // simplification tolerance (higher means simpler)
            extent: 4096, // tile extent
            buffer: 0, // tile buffer on each side
            lineMetrics: false, // whether to calculate line metrics
            promoteId: null, // name of a feature property to be promoted to feature.id
            generateId: false, // whether to generate feature ids. Cannot be used with promoteId
            debug: 0 // logging level (0, 1 or 2)
        });
        this.m_tileIndexMap.set(message.id, tileIndex);
        return { response: {} };
    }
}
