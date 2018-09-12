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

/** @module
 *
 * This module provides an implementation of `fetch()` that loosely follows the WHATWG standard,
 * with the addition that it can be canceled. Two implementations exist, one for Node.js using the
 * Node.js HTTP API and one for browser, using XHR requests internally.
 *
 * **Note**: Once the WHATWG standard supports cancellation of `fetch()` requests, this module will
 * be abandoned. More information here - https://fetch.spec.whatwg.org/.
 *
 */

/**
 * Instances of `CancellationException` are thrown when a fetch promise is canceled.
 */
export class CancellationException extends Error {
    /**
     * Flag indicating if an operation is canceled.
     */
    readonly isCancelled: boolean = true;

    constructor() {
        super("Request cancelled");
    }
}

/**
 * Instances of `CancellationToken` can be used to cancel an ongoing request.
 *
 * Example:
 *
 * ```typescript
 * const cancellationToken = new CancellationToken();
 * fetch("http://here.com/", { cancellationToken });
 * // later, if you decide to cancel the request:
 * cancellationToken.cancel();
 * ```
 *
 * **Note:** If you cancel an async function, it will not resolve but throw a
 * [[CancellationException]].
 *
 * **Note:** Cancellation is not guaranteed to work. Some functions do not support cancellation.
 * Others, due to the asynchronous nature, might have already finished by the time the cancellation
 * is received, in which case the result is returned rather than a [[CancellationException]].
 *
 * See also [[fetch]].
 */
export class CancellationToken {
    /**
     * Callback that is called when token gets cancelled. Set to receive cancellation signal
     * instantly.
     */
    _cancel?: () => void;

    /**
     * @internal
     */
    private m_isCancelled = false;

    /**
     * Call this function to cancel an ongoing operation.
     *
     * **Note:** Repeated calls to `cancel()` are ignored. A `CancellationToken` can only be
     * canceled once.
     */
    cancel() {
        this.m_isCancelled = true;
        if (this._cancel !== undefined) {
            this._cancel();
        }
    }

    /**
     * Returns `true` if the operation was canceled, `false` otherwise.
     */
    get isCancelled(): boolean {
        return this.m_isCancelled;
    }
}

/**
 * Typedef for the object that can be used to initialize [[Headers]]. Can either be another
 * [[Headers]] object or a plain JavaScript `Object` with key-value pairs.
 */
export type HeadersInit = Headers | { [index: string]: string };

/**
 * A multimap of key-value pairs for HTTP headers. Modeled after the WHATWG spec.
 */
export class Headers {
    private m_headers = new Map<string, string[]>();

    /**
     * Constructs a new `Headers` object.
     *
     * @param headers Initializes this object with the given headers.
     */
    constructor(headers?: HeadersInit) {
        if (headers === undefined) {
            return;
        }
        if (headers instanceof Headers) {
            headers.forEach((value, key) => this.append(key, value));
        } else {
            for (const key of Object.getOwnPropertyNames(headers)) {
                this.append(key, headers[key]);
            }
        }
    }

    /**
     * Appends an HTTP header. Note - in HTTP, a header can appear more than once. If the given key
     * already exists, a new key-value pair will be appended.
     *
     * @param key The name of the HTTP header.
     * @param value The value of the HTTP header.
     */
    append(key: string, value: string): void {
        const values = this.m_headers.get(key);
        if (values === undefined) {
            this.set(key, value);
        } else {
            values.push(value);
        }
    }

    /**
     * Returns all values for the given key.
     * Returns an empty array if the key is not found.
     *
     * @param key The key to look up.
     */
    getAll(key: string): string[] {
        const values = this.m_headers.get(key.toLowerCase());
        return values === undefined ? [] : values;
    }

    /**
     * Returns the value associated with the key. **Note:** If the key exists more than once, the
     * first one in insertion order will be returned.
     *
     * Use [[getAll]] to get all values associated with a key.
     *
     * @param key The key to look up.
     */
    get(key: string): string | null {
        const values = this.m_headers.get(key.toLowerCase());
        return values === undefined ? null : values[0];
    }

    /**
     * Resets a key, removing all prior values.
     *
     * @param key The key to reset.
     * @param value The new and only value to set.
     */
    set(key: string, value: string): void {
        this.m_headers.set(key.toLowerCase(), [value]);
    }

    /**
     * Returns `true` if the key exists in this object at least once, `false` otherwise.
     *
     * @param key The key to look up.
     */
    has(key: string): boolean {
        return this.m_headers.has(key.toLowerCase());
    }

    /**
     * Helper function to iterate over all key-value pairs.
     *
     * @param callback The callback is invoked once for all key-value pairs.
     */
    forEach(callback: (value: string, key: string, headers: Headers) => void) {
        this.m_headers.forEach((values, key) => {
            values.forEach(value => callback(value, key, this));
        });
    }
}

/**
 * Interface for the response of a fetch operation. Modeled after the WHATWG spec.
 */
export interface DownloadResponse {
    /**
     * The type of the response, for example, `basic`, `cors` or `error`.
     */
    type: string;

    /**
     * Contains the status of the response, for example, `200`.
     */
    status: number;

    /**
     * Contains the text for the status, for example, `OK`.
     */
    statusText: string;

    /**
     * True if the response was successful (for example, status between 200-299).
     */
    ok: boolean;

    /**
     * The HTTP [[Headers]] associated with this response.
     */
    headers: Headers;

    /**
     * The URL that was downloaded. Note - in case of one or more HTTP redirection, the URL points
     * to the final (last) URL downloaded.
     */
    url?: string;

    /** Returns a `Promise` that resolves to an `ArrayBuffer`. */
    arrayBuffer(): Promise<ArrayBuffer>;

    /** Returns a `Promise` that resolves to an `Object`. */
    json<T>(): Promise<T>;

    /** Returns a `Promise` that resolves to a plain string. */
    text(): Promise<string>;
}

/**
 * Extra options that can be passed to request tiles or partitions.
 */
export interface DownloadRequestInit {
    /** Optional cancellation token, can be used to cancel a request. */
    cancellationToken?: CancellationToken;

    /** Optional extra headers to send. */
    headers?: Headers;

    /**
     * The `responseType` to set on an XHR request. See `XMLHttpRequest.responseType` for more info.
     * If no `responseType` is given, it is determined by the `Content-Type` response header.
     */
    responseType?: "" | "arraybuffer" | "blob" | "document" | "json" | "text";

    /**
     * Optional. Whether to transparently handle the compression or not. If `true`, content will
     * always be decompressed. If `false`, content will never be decompressed.
     *
     * If `undefined`, content will be decompressed dependent on the content-type of the http
     * request.
     *
     * Note: When using XHR in a browser, the browser is transparently decompressing content,
     * regardless of this setting.
     */
    compression?: boolean;

    /** The HTTP method to use. Defaults to `GET` if `undefined`. */
    method?: string;

    /** The body of the request to send. Ignored for `GET` or `HEAD` HTTP methods. */
    body?: string;
}

/**
 * Implementations of `@here/fetch` must all adhere to this declaration.
 */
export type FetchFunction = (url: string, init?: DownloadRequestInit) => Promise<DownloadResponse>;

/** @hidden */
declare function fetch(_url: string): Promise<any>;

/**
 * `@here/fetch` implementation using the standard version of the browser's fetch API. Cannot be
 * canceled.
 *
 * @param url The URL to fetch.
 * @param init Optional parameters.
 */
export async function vanillaFetch(
    url: string,
    _init?: DownloadRequestInit
): Promise<DownloadResponse> {
    const response = await fetch(url);
    const result: DownloadResponse = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        type: response.type,
        url,

        headers: response.headers,

        arrayBuffer() {
            return response.arrayBuffer();
        },
        json<T>() {
            return response.json() as T;
        },
        text() {
            return response.text();
        }
    };
    return result;
}


/**
 * Adds a bearer token from a function to the headers of the request
 *
 * @param getBearerToken Function to retrieve the bearer token.
 * @param init the DownloadRequestInit parameters
 * @returns either a new DownloadRequestInit or the passed one with the bearerToken added to the
 *  headers.
 */
export async function addBearerToken(getBearerToken: () => Promise<string>,
    init?: DownloadRequestInit): Promise<DownloadRequestInit> {
    if (init === undefined) {
        init = {};
    }
    if (init.headers === undefined) {
        init.headers = new Headers();
    }

    const token = await getBearerToken();
    init.headers.append("Authorization", "Bearer " + token);

    return init;
}
