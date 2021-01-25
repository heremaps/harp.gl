/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConsoleChannel } from "./ConsoleChannel";
import { IChannel } from "./IChannel";
import { ILogger, LoggerOptions, LogLevel } from "./ILogger";
import { ILoggerManager } from "./ILoggerManager";
import { Logger } from "./Logger";
import { WorkerChannel } from "./WorkerChannel";

/**
 * LoggerManagerImpl is the class for the singleton instance of the logger manager.
 * It handles channels and loggers.
 */

export class LoggerManagerImpl implements ILoggerManager {
    channel: IChannel;
    private readonly m_loggers: ILogger[] = [];
    private m_levelSetForAll?: LogLevel;

    constructor() {
        this.channel =
            typeof self === "undefined" || typeof self.document !== "undefined"
                ? new ConsoleChannel()
                : new WorkerChannel();
    }

    getLoggerNames(): string[] {
        return this.m_loggers.map(logger => logger.name);
    }

    getLogger(name: string): ILogger | undefined {
        return this.m_loggers.find(logger => logger.name === name);
    }

    create(loggerName: string, options: LoggerOptions = {}): ILogger {
        if (
            this.m_levelSetForAll !== undefined &&
            (options.level === undefined || options.level < this.m_levelSetForAll)
        ) {
            options.level = this.m_levelSetForAll;
        }
        const logger = new Logger(loggerName, this.channel, options);
        this.m_loggers.push(logger);
        return logger;
    }

    dispose(logger: ILogger) {
        const found = this.m_loggers.indexOf(logger);
        if (found < 0) {
            throw new Error(`Cannot unregister "${logger}" : no such logger registered.`);
        }
        this.m_loggers.splice(found, 1);
    }

    updateAll(options: LoggerOptions) {
        for (const logger of this.m_loggers) {
            logger.update(options);
        }
    }

    update(loggerName: string, config: LoggerOptions) {
        for (const logger of this.m_loggers) {
            if (logger.name === loggerName) {
                logger.update(config);
            }
        }
    }

    enableAll(enabled: boolean) {
        for (const logger of this.m_loggers) {
            logger.enabled = enabled;
        }
    }

    enable(loggerName: string, value: boolean) {
        this.update(loggerName, { enabled: value });
    }

    setLogLevelForAll(level: LogLevel) {
        this.m_levelSetForAll = level;
        for (const logger of this.m_loggers) {
            logger.level = level;
        }
    }

    setLogLevel(loggerName: string, level: LogLevel) {
        this.update(loggerName, { level });
    }

    setChannel(channel: IChannel) {
        this.channel = channel;
    }
}
