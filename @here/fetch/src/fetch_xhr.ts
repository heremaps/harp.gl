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

import { CancellationException, DownloadRequestInit, DownloadResponse, Headers } from "./fetch";

function parseHeaders(xhrHeaders: string): Headers {
    const result = new Headers();
    for (const header of xhrHeaders.split("\r\n")) {
        const colon = header.indexOf(":");
        if (colon === -1) {
            // invalid header
            continue;
        }
        const name = header.substring(0, colon).trim();
        const value = header.substring(colon + 1).trim();
        result.append(name, value);
    }
    return result;
}

function getContentType(header: string | null): string | null {
    if (header === null) {
        return null;
    }
    const semicolon = header.indexOf(";");
    const result = semicolon === -1 ? header : header.substring(0, semicolon);
    return result.trim();
}

/**
 * Implementation of a fetch function using XHR.
 *
 * **Note:** Only a subset of the [WHATWG fetch](https://fetch.spec.whatwg.org/) API is supported,
 * for example, only HTTP `GET`.
 *
 * **Note:** The browsers generally decompress transparently, setting `init.compression` is ignored.
 *
 * @param url The URL to download.
 * @param init Optional extra parameters.
 */
export function cancellableFetch_xhr(
    url: string,
    init?: DownloadRequestInit
): Promise<DownloadResponse> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        if (init === undefined) {
            init = {};
        }

        if (init.cancellationToken !== undefined) {
            if (init.cancellationToken.isCancelled) {
                return reject(new CancellationException());
            }
            init.cancellationToken._cancel = () => xhr.abort();
        }

        if (init.responseType !== undefined) {
            xhr.responseType = init.responseType;
        }

        xhr.onload = () => {
            const result: DownloadResponse = {
                type: "default",
                status: xhr.status,
                statusText: xhr.statusText,
                ok: xhr.status >= 200 && xhr.status < 300,
                url,

                get headers() {
                    return parseHeaders(xhr.getAllResponseHeaders());
                },

                arrayBuffer(): Promise<ArrayBuffer> {
                    return xhr.responseType === "arraybuffer"
                        ? Promise.resolve(xhr.response as ArrayBuffer)
                        : Promise.reject(
                              new Error(
                                  "Content type " +
                                      getContentType(xhr.getResponseHeader("Content-Type")) +
                                      " cannot be expressed as ArrayBuffer, please use json() or" +
                                      " text() instead."
                              )
                          );
                },

                json<T>(): Promise<T> {
                    return xhr.responseType === "json"
                        ? Promise.resolve(xhr.response as T)
                        : Promise.reject(
                              new Error(`Response type must be "json" but is ${xhr.responseType}`)
                          );
                },

                text(): Promise<string> {
                    return xhr.responseType === "" || xhr.responseType === "text"
                        ? Promise.resolve(xhr.responseText)
                        : Promise.reject(new Error(`Response type must be "" or "text"`));
                }
            };

            resolve(result);
        };

        xhr.onerror = () => {
            reject(new TypeError("Network request failed"));
        };

        xhr.ontimeout = () => {
            reject(new TypeError("Network request timed out"));
        };

        xhr.onabort = () => {
            reject(new CancellationException());
        };

        xhr.onreadystatechange = () => {
            try {
                if (xhr.readyState === xhr.HEADERS_RECEIVED) {
                    if (init !== undefined && init.responseType !== undefined) {
                        xhr.responseType = init.responseType;
                        return;
                    }

                    // else, set the response type based on Content-Type
                    const contentType = getContentType(xhr.getResponseHeader("Content-Type"));
                    if (contentType === "text/plain") {
                        xhr.responseType = "text";
                    } else if (
                        contentType === "application/json" ||
                        contentType === "application/vnd.geo+json" ||
                        contentType === "application/geo+json"
                    ) {
                        xhr.responseType = "json";
                    } else {
                        xhr.responseType = "arraybuffer";
                    }
                }
            } catch {
                // non-conforming XHR implementations don't allow setting the response type
                // after headers were received.
                // Ignore the error and rely on xhr to return the matching reponse type.
            }
        };

        const method = init.method === undefined ? "GET" : init.method;
        xhr.open(method, url);

        if (init.headers !== undefined) {
            init.headers.forEach((value, key) => xhr.setRequestHeader(key, value));
        }

        xhr.send(init.body);
    });
}

/**
 * Default export, pointing to the XHR implementation of `fetch`.
 */
export const fetch = cancellableFetch_xhr;
