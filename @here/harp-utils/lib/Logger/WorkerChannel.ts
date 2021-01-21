/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { IChannel } from "./IChannel";
import { LogLevel } from "./ILogger";

declare let self: Worker;

export const WORKERCHANNEL_MSG_TYPE = "worker-channel-message";

/**
 * The interface for the messages of the WorkerChannel.
 */
export interface IWorkerChannelMessage {
    message: any[];
    type: "worker-channel-message";
    level: LogLevel;
}

/**
 * The class for the worker channel.
 */
export class WorkerChannel implements IChannel {
    error(message?: any, ...optionalParams: any[]) {
        const workerMessage: IWorkerChannelMessage = {
            message: [message, ...optionalParams],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Error
        };
        self.postMessage(workerMessage);
    }

    debug(message?: any, ...optionalParams: any[]) {
        const workerMessage: IWorkerChannelMessage = {
            message: [message, ...optionalParams],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Debug
        };
        self.postMessage(workerMessage);
    }

    info(message?: any, ...optionalParams: any[]) {
        const workerMessage: IWorkerChannelMessage = {
            message: [message, ...optionalParams],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Info
        };
        self.postMessage(workerMessage);
    }

    log(message?: any, ...optionalParams: any[]) {
        const workerMessage: IWorkerChannelMessage = {
            message: [message, ...optionalParams],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Log
        };
        self.postMessage(workerMessage);
    }

    trace(message?: any, ...optionalParams: any[]) {
        const workerMessage: IWorkerChannelMessage = {
            message: [message, ...optionalParams],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Trace
        };
        self.postMessage(workerMessage);
    }

    warn(message?: any, ...optionalParams: any[]) {
        const workerMessage: IWorkerChannelMessage = {
            message: [message, ...optionalParams],
            type: WORKERCHANNEL_MSG_TYPE,
            level: LogLevel.Warn
        };
        self.postMessage(workerMessage);
    }
}
