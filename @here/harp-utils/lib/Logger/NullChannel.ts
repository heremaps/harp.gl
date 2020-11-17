/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { IChannel } from "./IChannel";

/**
 * Class for the console in the CI, disable everything except errors.
 */

export class NullChannel implements IChannel {
    error(message?: any, ...optionalParams: any[]) {
        console.error(message, ...optionalParams);
    }

    debug(message?: any, ...optionalParams: any[]) {
        // Ignored.
    }

    info(message?: any, ...optionalParams: any[]) {
        // Ignored.
    }

    log(message?: any, ...optionalParams: any[]) {
        // Ignored.
    }

    trace(message?: any, ...optionalParams: any[]) {
        // Ignored.
    }

    warn(message?: any, ...optionalParams: any[]) {
        // Ignored.
    }
}
