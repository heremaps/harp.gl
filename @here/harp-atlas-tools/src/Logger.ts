/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

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
                // tslint:disable-next-line: no-console
                console.debug(msg, paramsToShow);
                break;
            case LogLevel.WARN:
                // tslint:disable-next-line: no-console
                console.warn(msg, paramsToShow);
                break;
            case LogLevel.ERROR:
                // tslint:disable-next-line: no-console
                console.error(msg, paramsToShow);
                break;
            default:
                // tslint:disable-next-line: no-console
                console.info(msg, paramsToShow);
                break;
        }
    }
}

class LoggerCritical implements Logger {
    log(level: LogLevel, msg?: any, ...optionalParams: any[]) {
        const paramsToShow = optionalParams.length ? optionalParams : "";
        if (level === LogLevel.INFO) {
            // tslint:disable-next-line: no-console
            console.info(msg, paramsToShow);
        } else if (level === LogLevel.WARN) {
            // tslint:disable-next-line: no-console
            console.warn(msg, paramsToShow);
        } else if (level === LogLevel.ERROR) {
            // tslint:disable-next-line: no-console
            console.error(msg, paramsToShow);
        }
    }
}
