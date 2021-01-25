/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// @here:check-imports:environment:node

import * as fs from "fs";
import { URL } from "url";
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
    global.fetch = fetchWithFileSupport;
    global.Response = node_fetch.Response;
    global.Headers = node_fetch.Headers;
    global.Request = node_fetch.Request;
    global.AbortController = AbortController;
    global.AbortSignal = AbortSignal;
}

export type FetchFunction = typeof fetch;

/**
 * A `fetch` implementation with local file system support.
 *
 * Web Hypertext Application Technology Working Group (WHATWG) `fetch` compliant decorator over
 * `node-fetch` that:
 *
 * * supports `file:` protocol
 * * treats relative URIs as relative to `process.cwd()`
 *
 * `@here/harp-fetch` exposes this function as `global.fetch` in the Node.js environment, so it
 * mimics the _browser_ `fetch` that supports relative URLs which are resolved against baseUrl.
 *
 * It also supports fetching local `file://` resources without the need to stub the `global.fetch`.
 *
 * *Use only for testing purposes*.
 *
 * Example:
 * ```
 *     const fetchStub = sandbox.stub(global as any, "fetch");
 *     fetchStub.callsFake(fetchWithFileSupport);
 *     await someApi.loadSomethingWithFetch("./test/resources/x.json");
 *     assert.equal(fetchStub, 1);
 * ```
 *
 * @see [fetch documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
 */
function fetchWithFileSupport(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const url = typeof input === "object" ? input.url : input;
    const parentUrl = `file://${process.cwd()}/`;
    const actualUrl = new URL(url, parentUrl);
    if (actualUrl.protocol === "file:") {
        return new Promise<Response>((resolve, reject) => {
            fs.readFile(actualUrl, (error, buffer) => {
                if (error) {
                    reject(new Error(`failed to read file ${actualUrl}: ${error}`));
                }

                const response = {
                    headers: new Headers(),
                    ok: true,
                    status: 200,
                    statusText: "OK",
                    type: "basic",
                    url: actualUrl.toString(),
                    size: buffer.byteLength,
                    timeout: 0,
                    body: null as any,
                    bodyUsed: false,
                    buffer() {
                        return Promise.resolve(buffer);
                    },
                    arrayBuffer() {
                        return Promise.resolve(buffer.buffer as ArrayBuffer);
                    },
                    json() {
                        return Promise.resolve(JSON.parse(buffer.toString("utf-8")));
                    },
                    text() {
                        return Promise.resolve(buffer.toString("utf-8"));
                    },
                    clone() {
                        return Object.assign({}, this);
                    }
                };
                resolve((response as any) as Response);
            });
        });
    } else {
        return node_fetch(url, init);
    }
}
