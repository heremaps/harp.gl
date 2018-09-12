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

// @here:check-imports:environment:node

import { CancellationException, DownloadRequestInit, DownloadResponse, Headers } from "./fetch";

import * as http from "http";
import * as https from "https";

import { PassThrough, Readable } from "stream";
import * as nodeUrl from "url";
import * as zlib from "zlib";

const MAXIMUM_REDIRECTIONS = 20;

class ErrorResponse implements DownloadResponse {
    type: string = "error";

    constructor(
        public url: string,
        public status: number,
        public statusText: string,
        public headers: Headers,
        public ok: boolean = status >= 200 && status < 300
    ) {}

    arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.reject(new Error("Response has no body"));
    }

    json<T>(): Promise<T> {
        return Promise.reject(new Error("Response has no body"));
    }

    text(): Promise<string> {
        return Promise.reject(new Error("Response has no body"));
    }
}

class Body {
    /**
     * Flag indicating if receiving the body has been completed.
     */
    done: boolean = false;

    /**
     * Flag indicating if the communication has been aborted.
     */
    aborted: boolean = false;

    /**
     * String contating the response body.
     */
    resultString?: string;

    /**
     * Binary data received in the response.
     */
    resultBuffers?: Buffer[];

    /**
     * The lengths of the binary data received in the response.
     */
    resultBufferLength: number = 0;

    /**
     * Array of listeners to decode different typse of responses, e.g. JSON, binary, text.
     */
    resultListeners = new Array<() => void>();

    constructor(readonly isString: boolean) {
        if (isString) {
            this.resultString = "";
        } else {
            this.resultBuffers = new Array<Buffer>();
        }
    }

    /**
     * Adds a chunk of retrieved data to the result.
     */
    appendChunk(chunk: string | Buffer) {
        if (typeof chunk === "string") {
            this.resultString += chunk;
        } else if (this.isString) {
            this.resultString += chunk.toString();
        } else {
            if (this.resultBuffers === undefined) {
                throw new Error("Invalid chunk type");
            }
            this.resultBufferLength += chunk.length;
            this.resultBuffers.push(chunk);
        }
    }

    /**
     * End the fetch communication.
     */
    end() {
        this.done = true;
        for (const listener of this.resultListeners) {
            listener();
        }
        this.resultListeners = [];
    }

    /**
     * Abort the fetch communication.
     */
    abort() {
        if (this.done) {
            return;
        } // aborting after request finished does nothing
        this.aborted = true;
        this.done = true;
        for (const listener of this.resultListeners) {
            listener();
        }
        this.resultListeners = [];
    }

    /**
     * Decode received message as text.
     */
    text(): Promise<string> {
        return new Promise((resolve, reject) => {
            const decoder = () => {
                if (this.aborted) {
                    return reject(new CancellationException());
                }
                this.isString
                    ? resolve(this.resultString)
                    : reject(new Error("Response body must be string"));
            };
            this.done ? decoder() : this.resultListeners.push(decoder);
        });
    }

    /**
     * Decode received message as JSON.
     */
    json<T>(): Promise<T> {
        return new Promise((resolve, reject) => {
            const decoder = () => {
                if (this.aborted) {
                    return reject(new CancellationException());
                }

                if (!this.isString || this.resultString === undefined) {
                    return reject(new Error("Response body must be string"));
                }

                let result;
                try {
                    result = JSON.parse(this.resultString) as T;
                } catch (err) {
                    reject(err);
                }
                resolve(result);
            };
            this.done ? decoder() : this.resultListeners.push(decoder);
        });
    }

    /**
     * Decode received message as a binary [[ArrayBuffer]].
     */
    arrayBuffer(): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const decoder = () => {
                if (this.aborted) {
                    return reject(new CancellationException());
                }
                if (this.isString || this.resultBuffers === undefined) {
                    return reject(new Error("Response type must be Buffer"));
                }
                const resultBuffer = Buffer.concat(this.resultBuffers, this.resultBufferLength);
                resolve(new Uint8Array(resultBuffer).buffer as ArrayBuffer);
            };
            this.done ? decoder() : this.resultListeners.push(decoder);
        });
    }
}

function parseHeaders(rawHeaders: string[]): Headers {
    const headers = new Headers();
    for (let i = 0; i < rawHeaders.length; i += 2) {
        headers.append(rawHeaders[i], rawHeaders[i + 1]);
    }
    return headers;
}

function getOptions(requestUrl: string, init?: DownloadRequestInit): http.RequestOptions | string {
    if (init === undefined) {
        return requestUrl;
    }

    const headers: { [key: string]: any } = {};
    if (init.headers !== undefined) {
        init.headers.forEach((value, key) => {
            headers[key] = value;
        });
    }

    const parsedUrl = nodeUrl.parse(requestUrl);

    const options = {
        headers,
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        auth: parsedUrl.auth,
        method: init.method === undefined ? "GET" : init.method
    };

    return options;
}

function getContentType(header: string | null): string | null {
    if (header === null) {
        return null;
    }
    const semicolon = header.indexOf(";");
    const result = semicolon === -1 ? header : header.substring(0, semicolon);
    return result.trim();
}

function compressionRequested(contentEncoding: string | null, init?: DownloadRequestInit): boolean {
    // if compression is explicitly true or false, return that
    if (init !== undefined && init.compression !== undefined) {
        return init.compression;
    }
    // otherwise, only uncompress if the content encoding is gzip
    return contentEncoding === "gzip" || contentEncoding === "x-gzip";
}

/**
 * Node.js implementation of [WHATWG fetch](https://fetch.spec.whatwg.org/) API. Only a subset is
 * supported, for example, only HTTP `GET`.
 *
 * **Note:** Transparently decompresses. Set `init.compression` to bypass.
 *
 * @param fetchUrl The URL to fetch.
 * @param init Optional parameters.
 */
export function cancellableFetch_node(
    fetchUrl: string,
    init?: DownloadRequestInit
): Promise<DownloadResponse> {
    let redirectionCount = 0;

    return new Promise((resolve, reject) => {
        let transport: typeof http;
        if (fetchUrl.startsWith("http:")) {
            transport = http;
        } else if (fetchUrl.startsWith("https:")) {
            transport = https as any;
        } else {
            return reject(new Error("Unknown protocol"));
        }

        const options = getOptions(fetchUrl, init);

        const request: http.ClientRequest = transport.request(
            options,
            (response: http.ClientResponse) => {
                const headers = parseHeaders(response.rawHeaders);

                if (response.statusCode === 301 || response.statusCode === 307) {
                    // follow redirections
                    if (++redirectionCount > MAXIMUM_REDIRECTIONS) {
                        reject(
                            new ErrorResponse(
                                fetchUrl,
                                response.statusCode,
                                "Too many redirections",
                                headers
                            )
                        );
                        return;
                    }
                    const newLocation = headers.get("location");
                    if (newLocation === null) {
                        return reject(
                            new ErrorResponse(
                                fetchUrl,
                                response.statusCode,
                                "No location header in redirect",
                                headers
                            )
                        );
                    }
                    const redirectedUrl = nodeUrl.resolve(fetchUrl, newLocation);
                    cancellableFetch_node(redirectedUrl, init)
                        .then(result => resolve(result))
                        .catch(err => reject(err));
                    return;
                } else if (response.statusCode === 204) {
                    return resolve(new ErrorResponse(fetchUrl, 204, "No Content", headers));
                }

                const contentType = getContentType(headers.get("content-type"));
                const isText = contentType === "text/plain" || contentType === "application/json";

                let data: Readable = response;

                const contentEncoding = headers.get("content-encoding");
                if (compressionRequested(contentEncoding, init)) {
                    data = response.pipe(new PassThrough()).pipe(zlib.createUnzip());
                } else if (isText) {
                    response.setEncoding("utf8");
                }

                const body = new Body(isText);

                const downloadResponse: DownloadResponse = {
                    type: "default",
                    status: response.statusCode === undefined ? 0 : response.statusCode,
                    statusText: response.statusMessage === undefined ? "" : response.statusMessage,
                    ok:
                        response.statusCode !== undefined &&
                        (response.statusCode >= 200 && response.statusCode < 300),
                    headers,
                    url: fetchUrl,

                    text(): Promise<string> {
                        return body.text();
                    },

                    json<T>(): Promise<T> {
                        return body.json();
                    },

                    arrayBuffer(): Promise<ArrayBuffer> {
                        return body.arrayBuffer();
                    }
                };

                data.on("data", (chunk: string | Buffer) => {
                    body.appendChunk(chunk);
                });

                data.on("end", () => {
                    body.end();
                });

                if (init !== undefined && init.cancellationToken !== undefined) {
                    init.cancellationToken._cancel = () => {
                        request.abort();
                    };
                }

                response.on("abort", () => {
                    body.abort();
                });

                resolve(downloadResponse);
            }
        );

        if (init !== undefined && init.body !== undefined) {
            request.write(init.body);
        }

        if (init !== undefined && init.cancellationToken !== undefined) {
            if (init.cancellationToken.isCancelled) {
                request.abort();
                reject(new CancellationException());
            } else {
                init.cancellationToken._cancel = () => {
                    request.abort();
                    reject(new CancellationException());
                };
            }
        }

        request.on("error", err => reject(err));
        request.end();
    });
}

/**
 * Default export, pointing to the Node.js implementation of `fetch`.
 */
export const fetch = cancellableFetch_node;
