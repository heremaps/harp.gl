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

/**
 * Interface for `DecodedTileMessage` which describes metadata for a decoded tile.
 */
export interface DecodedTileMessage {
    service: string;
    type: DecodedTileMessageName;
}

/**
 * Interface for `OptionsMap` which describes a general structure of key-value pairs.
 */
export interface OptionsMap {
    [name: string]: any;
}

/**
 * Interface for a ConfigurationMessage that is sent from the datasource to the decoder. The message
 * used to configure the [[ITileDecoder]].
 */
export interface ConfigurationMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Configuration;
    styleSet?: StyleSet;
    options?: OptionsMap;
    languages?: string[];
}

/**
 * Type guard to check if an object is an instance of `ConfigurationMessage`.
 */
export function isConfigurationMessage(message: any): message is ConfigurationMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Configuration
    );
}

/**
 * This message is sent by the worker to the main thread. No data is sent. Receiving this message
 * confirms that the worker has started successfully.
 */
export interface InitializedMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Initialized;
}

/**
 * Type guard to check if an object is a signal message from worker.
 */
export function isInitializedMessage(message: any): message is InitializedMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Initialized
    );
}

/**
 * This message is sent by the main thread to [[WorkerServiceManager]] to dynamically create a new
 * service.
 */
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

/**
 * This message is sent by the main thread to [[WorkerServiceManager]] to dynamically destroy a
 * service.
 */
export interface DestroyFactoryMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.DestroyService;

    /**
     * Id of service to be destroyed.
     */
    targetServiceId: string;
}

/**
 * Possible service management messages (`CreateService` or `DestroyService`) sent to Web Worker.
 */
export type WorkerServiceManagerMessage = CreateServiceMessage | DestroyFactoryMessage;

/**
 * This message is a part of the Request-Response scheme implemented to be used in communication
 * between workers and the decoder.
 */
export interface RequestMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Request;
    messageId: number;
    request: any;
}

/**
 * This message is a part of the Request-Response scheme implemented to be used in communication
 * between workers and the decoder.
 */
export interface ResponseMessage extends DecodedTileMessage {
    type: DecodedTileMessageName.Response;
    messageId: number;
    error?: object;
    response?: object;
}

/**
 * Type guard to check if an object is a request message sent to a worker.
 */
export function isRequestMessage(message: any): message is RequestMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Request
    );
}

/**
 * Type guard to check if an object is a request message sent to a worker.
 */
export function isResponseMessage(message: any): message is ResponseMessage {
    return (
        message &&
        typeof message.service === "string" &&
        typeof message.type === "string" &&
        message.type === DecodedTileMessageName.Response
    );
}

/**
 * This is an internal general interface used in communication with workers.
 * Check [[ConcurrentWorkerSet]]'s invokeRequest function for exemplary usage.
 */
export interface Request {
    type: Requests;
}

/**
 * This object is sent to the decoder asking to decode a specific tile. The expected response type
 * is a [[DecodedTile]].
 */
export interface DecodeTileRequest extends Request {
    type: Requests.DecodeTileRequest;
    tileKey: number;
    data: ArrayBufferLike;
    projection: string;
    displayZoomLevel?: number;
}

/**
 * Type guard to check if an object is a decoded tile object sent to a worker.
 */
export function isDecodeTileRequest(message: any): message is DecodeTileRequest {
    return (
        message && typeof message.type === "string" && message.type === Requests.DecodeTileRequest
    );
}

/**
 * This object is sent to the decoder asking for a tile info of a specific tile. The expected
 * response type is a [[DecodedTile]].
 */
export interface TileInfoRequest extends Request {
    type: Requests.TileInfoRequest;
    tileKey: number;
    data: ArrayBufferLike;
    projection: string;
    displayZoomLevel?: number;
}

/**
 * Type guard to check if an object is an info tile object sent to a worker.
 */
export function isTileInfoRequest(message: any): message is TileInfoRequest {
    return message && typeof message.type === "string" && message.type === Requests.TileInfoRequest;
}
