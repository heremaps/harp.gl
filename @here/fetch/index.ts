/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

// tslint:disable-next-line:no-var-requires
const node_fetch = require("node-fetch");

declare const global: any;

class AbortSignal {
    aborted = false;
}

class AbortController {
    signal = new AbortSignal();
    abort() {
        this.signal.aborted = true;
    }
}

if (global.fetch === undefined) {
    global.fetch = node_fetch;
    global.Response = node_fetch.Response;
    global.Headers = node_fetch.Headers;
    global.Request = node_fetch.Request;
    global.AbortController = AbortController;
    global.AbortSignal = AbortSignal;
}

export type FetchFunction = typeof fetch;
