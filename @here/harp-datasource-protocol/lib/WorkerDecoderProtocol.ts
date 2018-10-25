/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet } from "./Theme";

/**
 * Define possible names of messages exchanged with decoder services within `WebWorker`.
 */
export enum DecodedTileMessageName {
    Configuration = "configuration",
    Initialized = "initialized",
    Request = "request",
    Response = "response",
    CreateService = "create-service",
    DestroyService = "destroy-service"
}

/**
 * Service id of worker manager ([[WorkerServiceManager]]) used to create/destroy service
 * instances in workers.
 */
export const WORKER_SERVICE_MANAGER_SERVICE_ID = "worker-service-manager";

/**
 * Define possible names of requests called on decoder services within `WebWorker`.
 */
export enum Requests {
    DecodeTileRequest = "decode-tile-request",
    TileInfoRequest = "tile-info-request"
}

export interface DecodedTileMessage {
    service: string;
    type: DecodedTileMessageName;
}

export interface OptionsMap {
    [name: string]: any;
}

export interface ConfigurationMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Configuration;
    styleSet?: StyleSet;
    options?: OptionsMap;
    languages?: string[];
}

export function isConfigurationMessage(message: any): message is ConfigurationMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Configuration
    );
}

export interface InitializedMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Initialized;
}

export function isInitializedMessage(message: any): message is InitializedMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Initialized
    );
}

export interface CreateServiceMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.CreateService;

    /**
     * Type of service to be created.
     *
     * @see [[WorkerServiceManager.register]]
     */
    targetServiceType: string;

    /**
     * The newly created service instance will be available under this id.
     */
    targetServiceId: string;
}

export interface DestroyFactoryMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.DestroyService;

    /**
     * Id of service to be destroyed.
     */
    targetServiceId: string;
}

export type WorkerServiceManagerMessage = CreateServiceMessage | DestroyFactoryMessage;

export interface RequestMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Request;
    messageId: number;
    request: any;
}

export interface ResponseMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Response;
    messageId: number;
    error?: object;
    response?: object;
}

export function isRequestMessage(message: any): message is RequestMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Request
    );
}

export function isResponseMessage(message: any): message is ResponseMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Response
    );
}

export interface Request {
    type: Requests;
}

export interface DecodeTileRequest extends Request {
    type: Requests.DecodeTileRequest;
    tileKey: number;
    data: ArrayBufferLike;
    projection: string;
    displayZoomLevel?: number;
}

export function isDecodeTileRequest(message: any): message is DecodeTileRequest {
    return (
        message && typeof message.type === "string" && message.type === Requests.DecodeTileRequest
    );
}

export interface TileInfoRequest extends Request {
    type: Requests.TileInfoRequest;
    tileKey: number;
    data: ArrayBufferLike;
    projection: string;
    displayZoomLevel?: number;
}

export function isTileInfoRequest(message: any): message is TileInfoRequest {
    return message && typeof message.type === "string" && message.type === Requests.TileInfoRequest;
}
