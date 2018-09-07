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
