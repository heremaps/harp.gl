/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITiler, WorkerTilerProtocol } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";

import { GeoJsonTiler } from "./GeoJsonTiler";
import { WorkerService, WorkerServiceResponse } from "./WorkerService";

/**
 * An extension to {@link WorkerService}, the `TilerService`
 * implements an asynchronous (message based)
 * service to tile untiled payloads in web workers.
 *
 * @remarks
 * The `TilerService` itself lives in the web
 * worker, and communicates with messages by means of a `ConcurrentWorkerSet` with the
 * application.
 *
 * The `TilerService` registers tile indices (parent tile to be subdivided) by handling a
 * `RegisterIndexRequest`, and can later retrieve tiled payloads from through the `TileRequest`.
 * The data is sent back in form of a {@link WorkerServiceResponse}.
 */
export class TilerService extends WorkerService {
    /**
     * Start a `TilerService`.
     *
     * @param serviceId - Service id. Must be unique.
     */
    static start(serviceId: string) {
        return new TilerService(serviceId);
    }

    tiler: ITiler = new GeoJsonTiler();

    /**
     * Set up the `TilerService`. The name of the service must be unique
     *
     * @param serviceId - Service id. Must be unique.
     */
    constructor(readonly serviceId: string) {
        super(serviceId);
    }

    /**
     * Handle incoming request messages. Identifies message type and processes the request.
     *
     * @param request - {@link WorkerTilerProtocol} request.
     * @returns A promise which resolves to a {@link WorkerServiceResponse}.
     * @override
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
        const tileKey = TileKey.fromMortonCode(request.tileKey);
        const tile = await this.tiler.getTile(request.index, tileKey);

        return { response: tile || {} };
    }

    private async handleRegisterIndexRequest(
        message: WorkerTilerProtocol.RegisterIndexRequest
    ): Promise<WorkerServiceResponse> {
        const input = typeof message.input === "string" ? new URL(message.input) : message.input;
        await this.tiler.registerIndex(message.id, input);

        return { response: {} };
    }

    private async handleUpdateIndexRequest(
        message: WorkerTilerProtocol.UpdateIndexRequest
    ): Promise<WorkerServiceResponse> {
        const input = typeof message.input === "string" ? new URL(message.input) : message.input;

        this.tiler.updateIndex(message.id, input);

        return { response: {} };
    }
}
