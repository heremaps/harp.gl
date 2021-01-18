/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

export enum LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR
}

export interface Logger {
    log(level: LogLevel, msg?: any, ...optionalParams: any[]): void;
}

export function getLogger(verbose: boolean): Logger {
    if (verbose) {
        return new LoggerVerbose();
    } else {
        return new LoggerCritical();
    }
}

class LoggerVerbose implements Logger {
    log(level: LogLevel, msg?: any, ...optionalParams: any[]): void {
        const paramsToShow = optionalParams.length ? optionalParams : "";
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(msg, paramsToShow);
                break;
            case LogLevel.WARN:
                console.warn(msg, paramsToShow);
                break;
            case LogLevel.ERROR:
                console.error(msg, paramsToShow);
                break;
            default:
                console.info(msg, paramsToShow);
                break;
        }
    }
}

class LoggerCritical implements Logger {
    log(level: LogLevel, msg?: any, ...optionalParams: any[]) {
        const paramsToShow = optionalParams.length ? optionalParams : "";
        if (level === LogLevel.INFO) {
            console.info(msg, paramsToShow);
        } else if (level === LogLevel.WARN) {
            console.warn(msg, paramsToShow);
        } else if (level === LogLevel.ERROR) {
            console.error(msg, paramsToShow);
        }
    }
}
