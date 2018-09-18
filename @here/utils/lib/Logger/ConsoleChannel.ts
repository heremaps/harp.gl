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
 * Class for the default console channel.
 */

export class ConsoleChannel implements IChannel {
    error(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.error(message, ...optionalParams);
    }

    debug(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.debug(message, ...optionalParams);
    }

    info(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.info(message, ...optionalParams);
    }

    log(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.log(message, ...optionalParams);
    }

    trace(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.trace(message, ...optionalParams);
    }

    warn(message?: any, ...optionalParams: any[]) {
        // tslint:disable-next-line:no-console
        console.warn(message, ...optionalParams);
    }
}
