/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJson } from "../lib/GeoJsonDataType";
import { WorkerServiceProtocol } from "./WorkerServiceProtocol";

/**
 * Communication protocol with {@link ITiler}.
 */
export namespace WorkerTilerProtocol {
    /**
     * Define possible names of requests called on tiler services within `WebWorker`.
     */
    export enum Requests {
        RegisterIndex = "register-index",
        UpdateIndex = "update-index",
        TileRequest = "tile-request"
    }

    /**
     * This object is sent to the tiler to register a new tile index in the worker.
     */
    export interface RegisterIndexRequest extends WorkerServiceProtocol.ServiceRequest {
        type: Requests.RegisterIndex;
        id: string;
        input: string | GeoJson;
    }

    /**
     * Type guard to check if an object is an index registration request sent to a worker.
     */
    export function isRegisterIndexRequest(message: any): message is RegisterIndexRequest {
        return (
            message && typeof message.type === "string" && message.type === Requests.RegisterIndex
        );
    }

    /**
     * This object is sent to the tiler to register a new tile index in the worker.
     */
    export interface UpdateIndexRequest extends WorkerServiceProtocol.ServiceRequest {
        type: Requests.UpdateIndex;
        id: string;
        input: string | GeoJson;
    }

    /**
     * Type guard to check if an object is an update request for the index registration.
     */
    export function isUpdateIndexRequest(message: any): message is UpdateIndexRequest {
        return message && typeof message.type === "string" && message.type === Requests.UpdateIndex;
    }

    /**
     * This object is sent to the tiler asking to retrieve a specific tile. The expected response
     * type is an object containing a tiled payload.
     */
    export interface TileRequest extends WorkerServiceProtocol.ServiceRequest {
        type: Requests.TileRequest;
        index: string;
        tileKey: number;
    }

    /**
     * Type guard to check if an object is a tile request sent to a worker.
     */
    export function isTileRequest(message: any): message is TileRequest {
        return message && typeof message.type === "string" && message.type === Requests.TileRequest;
    }
}
