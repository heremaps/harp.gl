/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { IChannel } from "./IChannel";

/**
 * Class for the default console channel.
 */

export class ConsoleChannel implements IChannel {
    error(message?: any, ...optionalParams: any[]) {
        console.error(message, ...optionalParams);
    }

    debug(message?: any, ...optionalParams: any[]) {
        console.debug(message, ...optionalParams);
    }

    info(message?: any, ...optionalParams: any[]) {
        console.info(message, ...optionalParams);
    }

    log(message?: any, ...optionalParams: any[]) {
        console.log(message, ...optionalParams);
    }

    trace(message?: any, ...optionalParams: any[]) {
        console.trace(message, ...optionalParams);
    }

    warn(message?: any, ...optionalParams: any[]) {
        console.warn(message, ...optionalParams);
    }
}
