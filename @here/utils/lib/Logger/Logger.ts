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
import { ILogger, LoggerOptions, LogLevel } from "./ILogger";

/**
 * Logger class.
 */
export class Logger implements ILogger {
    enabled: boolean = true;
    level: LogLevel = LogLevel.Trace;

    constructor(readonly name: string, private m_channel: IChannel, options?: LoggerOptions) {
        if (options !== undefined) {
            this.update(options);
        }
    }

    error(message?: any, ...optionalParams: any[]) {
        if (this.enabled && this.level <= LogLevel.Error) {
            this.m_channel.error(this.prefix, message, ...optionalParams);
        }
    }

    debug(message?: any, ...optionalParams: any[]) {
        if (this.enabled && this.level <= LogLevel.Debug) {
            this.m_channel.debug(this.prefix, message, ...optionalParams);
        }
    }

    info(message?: any, ...optionalParams: any[]) {
        if (this.enabled && this.level <= LogLevel.Info) {
            this.m_channel.info(this.prefix, message, ...optionalParams);
        }
    }

    log(message?: any, ...optionalParams: any[]) {
        if (this.enabled && this.level <= LogLevel.Log) {
            this.m_channel.log(this.prefix, message, ...optionalParams);
        }
    }

    trace(message?: any, ...optionalParams: any[]) {
        if (this.enabled && this.level <= LogLevel.Trace) {
            this.m_channel.trace(this.prefix, message, ...optionalParams);
        }
    }

    warn(message?: any, ...optionalParams: any[]) {
        if (this.enabled && this.level <= LogLevel.Warn) {
            this.m_channel.warn(this.prefix, message, ...optionalParams);
        }
    }

    update(options: LoggerOptions) {
        this.enabled = options.enabled === undefined ? this.enabled : options.enabled;
        this.level = options.level === undefined ? this.level : options.level;
    }

    private get prefix(): string {
        return this.name + ":";
    }
}
