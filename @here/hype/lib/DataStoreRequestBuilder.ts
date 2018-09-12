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

import { RequestBuilder, RequestOptions, UrlBuilder } from "@here/datastore-api";
import { DownloadManager } from "@here/download-manager";
import {
    addBearerToken,
    DownloadRequestInit, DownloadResponse, Headers
} from "@here/fetch";

/** @hidden */
function convertDownloadOptions(init?: RequestOptions): DownloadRequestInit | undefined {
    if (init === undefined) {
        return undefined;
    }

    return {
        method: init.method,
        body: init.body,
        headers: init.headers === undefined ? undefined : new Headers(init.headers)
    };
}

export abstract class DataStoreRequestBuilder extends RequestBuilder {
    abstract downloadData(url: string, init?: DownloadRequestInit): Promise<DownloadResponse>;
    abstract clone(baseUrl?: string): DataStoreRequestBuilder;
}

/** @hidden */
export class DataStoreAppIdRequestBuilder extends DataStoreRequestBuilder {
    constructor(
        readonly downloadManager: DownloadManager,
        baseUrl: string,
        private readonly app_id?: string,
        private readonly app_code?: string
    ) {
        super(baseUrl);
    }

    clone(baseUrl?: string): DataStoreRequestBuilder {
        return new DataStoreAppIdRequestBuilder(
            this.downloadManager,
            baseUrl === undefined ? this.baseUrl : baseUrl,
            this.app_id,
            this.app_code
        );
    }

    download<T>(url: string, init?: RequestOptions): Promise<T> {
        return this.downloadManager.downloadJson<T>(url, convertDownloadOptions(init));
    }

    request<T>(urlObj: UrlBuilder, init?: RequestOptions): Promise<T> {
        if (this.app_id !== undefined && this.app_code !== undefined) {
            urlObj.appendQuery("app_id", this.app_id);
            urlObj.appendQuery("app_code", this.app_code);
        }
        return this.download<T>(urlObj.url, init);
    }

    downloadData(url: string, init?: DownloadRequestInit): Promise<DownloadResponse> {
        let finalUrl = url;
        if (this.app_id !== undefined && this.app_code !== undefined) {
            const hasQuery = url.includes("?");
            const urlObj = new UrlBuilder(url, hasQuery);
            urlObj.appendQuery("app_id", this.app_id);
            urlObj.appendQuery("app_code", this.app_code);
            finalUrl = urlObj.url;
        }

        return this.downloadManager.download(finalUrl, init);
    }
}

/** @hidden */
export class DataStoreOAuthRequestBuilder extends DataStoreRequestBuilder {
    constructor(
        readonly downloadManager: DownloadManager,
        baseUrl: string,
        private readonly getBearerToken: () => Promise<string>
    ) {
        super(baseUrl);
    }

    clone(baseUrl?: string): DataStoreRequestBuilder {
        return new DataStoreOAuthRequestBuilder(
            this.downloadManager,
            baseUrl === undefined ? this.baseUrl : baseUrl,
            this.getBearerToken
        );
    }

    async download<T>(url: string, init?: RequestOptions): Promise<T> {
        const options = await this.addBearerToken(convertDownloadOptions(init));
        return this.downloadManager.downloadJson<T>(url, options);
    }

    async downloadData(url: string, init?: DownloadRequestInit): Promise<DownloadResponse> {
        init = await this.addBearerToken(init);
        return this.downloadManager.download(url, init);
    }

    private async addBearerToken(init?: DownloadRequestInit): Promise<DownloadRequestInit> {
        return addBearerToken(this.getBearerToken, init);

    }
}
