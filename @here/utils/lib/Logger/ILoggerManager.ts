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
 * Public interface for interacting with LoggerManager class.
 *
 * The logger manager creates named Logger instances. Every logger is registered and can be enabled
 * or disabled using its own name.
 *
 * It is a good practice to remove a logger from the registry if it is not in use anymore.
 */
export interface ILoggerManager {
    channel: IChannel;

    /**
     * Returns an array of logger names.
     */
    getLoggerNames(): string[];

    /**
     * Returns a logger.
     */
    getLogger(name: string): ILogger | undefined;

    /**
     * Create named logger instance.
     *
     * @param  {string} loggerName Logger name which is logged to output.
     * @param  {LoggerOptions} options? Optional logger options.
     * Overrides default options if specified.
     */
    create(loggerName: string, options?: LoggerOptions): ILogger;

    /**
     * Remove logger from registry.
     *
     * @param  {ILogger} logger Logger to unregister
     */
    dispose(logger: ILogger): void;

    /**
     * Update all registered loggers with given options.
     *
     * @param  {LoggerOptions} options Options to apply.
     */
    updateAll(options: LoggerOptions): void;

    /**
     * Update all loggers with specified name.
     *
     * @param  {string} loggerName Loggers for update.
     * @param  {LoggerOptions} config Options to apply.
     */
    update(loggerName: string, config: LoggerOptions): void;

    /**
     * Enable / disable all loggers
     *
     * @param  {boolean} value Indicates if all loggers should be enabled / disabled
     */
    enableAll(value: boolean): void;

    /** Enable / disable loggers with specified name.
     *
     * @param  {string} loggerName Logger name for update.
     * @param  {boolean} value Indicates if loggers should be enabled / disabled
     */
    enable(loggerName: string, value: boolean): void;

    /**
     * Set log level for all loggers.
     *
     * @param  {LogLevel} level Level to set
     */
    setLogLevelForAll(level: LogLevel): void;

    /**
     * Set log level for named logger.
     *
     * @param  {string} loggerName Log to update
     * @param  {LogLevel} level Level to set
     */
    setLogLevel(loggerName: string, level: LogLevel): void;

    /**
     * Change the output channel.
     *
     * @param  {IChannel} channel Channel instance
     */
    setChannel(channel: IChannel): void;
}
