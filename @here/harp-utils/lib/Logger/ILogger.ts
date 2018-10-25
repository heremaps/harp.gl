/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { IChannel } from "./IChannel";

/**
 * Enum log levels
 */
export enum LogLevel {
    Trace,
    Debug,
    Log,
    Info,
    Warn,
    Error
}

/**
 * Logger options to configure logger
 */
export class LoggerOptions {
    enabled?: boolean;
    level?: LogLevel;
}

/**
 * Public interface for Logger class.
 */
export interface ILogger extends IChannel {
    readonly name: string;

    enabled: boolean;

    level: LogLevel;

    /**
     * Update logger options
     *
     * @param  {LoggerOptions} options Set logger options and configure internal logger.
     */
    update(options: LoggerOptions): void;
}
