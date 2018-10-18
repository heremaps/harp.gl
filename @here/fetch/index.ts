/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
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
