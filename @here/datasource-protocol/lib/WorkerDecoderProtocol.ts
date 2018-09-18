/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { StyleSet } from "./Theme";

/**
 * Define possible names of messages exchanged with decoder services within `WebWorker`.
 */
export enum DecodedTileMessageName {
    Configuration = "configuration",
    Initialized = "initialized",
    Request = "request",
    Response = "response"
}

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
}

export function isTileInfoRequest(message: any): message is TileInfoRequest {
    return message && typeof message.type === "string" && message.type === Requests.TileInfoRequest;
}
