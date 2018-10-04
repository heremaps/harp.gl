/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
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
