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
 * Class allowing mixing several channels.
 */
export class MultiChannel implements IChannel {
    private readonly channels: IChannel[] = [];
    constructor(...channels: IChannel[]) {
        this.channels = channels;
    }

    error(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.error(message, ...optionalParams);
        }
    }

    debug(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.debug(message, ...optionalParams);
        }
    }

    info(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.info(message, ...optionalParams);
        }
    }

    log(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.log(message, ...optionalParams);
        }
    }

    trace(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.trace(message, ...optionalParams);
        }
    }

    warn(message?: any, ...optionalParams: any[]) {
        for (const channel of this.channels) {
            channel.warn(message, ...optionalParams);
        }
    }
}
