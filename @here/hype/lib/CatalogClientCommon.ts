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

import { DownloadResponse, Headers } from "@here/fetch";
import { TileKey } from "@here/geoutils/lib/tiling/TileKey";

/**
 * A typedef for a map that matches subkeys to the meta data of the given subkey.
 */
export type IndexMap = Map<number, string>;

/** @hidden */
export class Error204Response implements DownloadResponse {
    status: number = 204;
    statusText: string = "No Content";
    ok: boolean = true;
    type: string = "default";
    get headers() {
        return new Headers();
    }

    arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.resolve(new ArrayBuffer(0));
    }
    json<T>(): Promise<T> {
        return Promise.reject(new Error("Response has no body"));
    }
    text(): Promise<string> {
        return Promise.resolve("");
    }
}

export class ErrorHTTPResponse extends Error {
    name: string = "HTTPError";
    message: string;
    status: number;
    statusText: string;
    constructor(message?: string, httpResponse?: DownloadResponse) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
        this.message = message || "";
        this.statusText = httpResponse && httpResponse.statusText || "";
        this.status = httpResponse && httpResponse.status || 0;
    }
}

/**
 * A download response that includes the actual tileKey being fetched.
 *
 * When downloading aggregated tiles, the tile itself or its closest ancestor is being downloaded.
 * This Response contains the actual tile key that is being downloaded.
 */
export interface AggregatedDownloadResponse extends DownloadResponse {
    /**
     * The tileKey being downloaded, or `undefined` if an error occurred.
     */
    tileKey?: TileKey;
}
