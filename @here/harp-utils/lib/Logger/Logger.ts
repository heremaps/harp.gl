/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { IChannel } from "./IChannel";
import { ILogger, LoggerOptions, LogLevel } from "./ILogger";

/**
 * Logger class.
 */
export class Logger implements ILogger {
    enabled: boolean = true;
    level: LogLevel = LogLevel.Trace;

    constructor(
        readonly name: string,
        private readonly m_channel: IChannel,
        options?: LoggerOptions
    ) {
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
