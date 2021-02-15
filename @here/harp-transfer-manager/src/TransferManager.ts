/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/** @module
 *
 * This module provides classes to ease downloading URLs. In particular, following redirects,
 * retrying on HTTP errors, and limiting the number of parallel concurrent downloads.
 */

import "@here/harp-fetch";

import { DeferredPromise } from "./DeferredPromise";

/**
 * Abstract interface for a transfer manager.
 *
 * Provides functionality for downloading JSON or ArrayBuffers.
 * Implementations typically implement retry on server congestion,
 * limit the maximum amount of parallel downloads or merge duplicate
 * downloads.
 */
export interface ITransferManager {
    /**
     * Downloads a JSON object.
     * @param url - The URL to download
     * @param init - Optional extra parameters for the download.
     */
    downloadJson<T>(url: RequestInfo, init?: RequestInit): Promise<T>;

    /**
     * Downloads a binary object.
     * @param url - The URL to download
     * @param init - Optional extra parameters for the download
     */
    downloadArrayBuffer(url: RequestInfo, init?: RequestInit): Promise<ArrayBuffer>;

    /**
     * Downloads a URL and returns the response.
     * @param url - The URL to download.
     * @param init - Optional extra parameters for the download.
     */
    download(url: RequestInfo, init?: RequestInit): Promise<Response>;
}

/**
 * `TransferManager` for downloading URLs.
 *
 * Features:
 *
 * * Merges JSON downloads, for example, the same URL if requested as JSON will only be downloaded
 *   once.
 * * Limits the amount of parallel downloads, useful when requesting a large amount of URLs that
 *   would otherwise stall the browser.
 * * Retries the downloads with an increasing timeout on HTTP 503 replies.
 *
 * The static method [[instance]] can be used to get a default constructed instance.
 */
export class TransferManager implements ITransferManager {
    /**
     * The timeout in milliseconds to wait between retries. This timeout is multiplied with the
     * number of retries. First retry waits for 0 ms, second retry for 500 ms, third for 1000 ms and
     * so on.
     */
    static readonly retryTimeout = 500;
    /**
     * The amount of maximum parallel downloads to allow.
     */
    static readonly maxParallelDownloads = 16;
    /**
     * Returns a default instance of [[TransferManager]].
     */
    static instance(): TransferManager {
        return TransferManager.defaultInstance;
    }

    private static readonly defaultInstance = new TransferManager();
    private static async fetchRepeatedly(
        fetchFunction: typeof fetch,
        retryCount: number,
        maxRetries: number,
        url: RequestInfo,
        init?: RequestInit
    ): Promise<Response> {
        try {
            if (retryCount < maxRetries) {
                const response = await fetchFunction(url, init);
                // Return response when successful or empty
                if (response.status === 200 || response.status === 204) {
                    return response;
                } else if (response.status >= 400 && response.status < 500) {
                    // Prevent further retries in case of a client error code
                    retryCount = maxRetries;
                    const responseText = await response.text();
                    throw new Error(responseText);
                }
            } else {
                throw new Error("Max number of retries reached");
            }
        } catch (err) {
            if (
                err.hasOwnProperty("isCancelled") ||
                err.name === "AbortError" ||
                retryCount >= maxRetries
            ) {
                throw err;
            }
        }
        return await TransferManager.waitFor(TransferManager.retryTimeout * retryCount).then(() =>
            TransferManager.fetchRepeatedly(fetchFunction, retryCount + 1, maxRetries, url, init)
        );
    }

    private static waitFor(milliseconds: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
    }

    private activeDownloadCount = 0;
    private readonly downloadQueue = new Array<DeferredPromise<Response>>();
    private readonly activeDownloads = new Map<RequestInfo, Promise<any>>();
    /**
     * Constructs a new [[TransferManager]].
     *
     * @param fetchFunction - The default fetch function to use.
     * @param maxRetries - The maximum amount to try to re-fetch a resource.
     */
    constructor(readonly fetchFunction = fetch, readonly maxRetries: number = 5) {}
    /**
     * Downloads a JSON object. Merges downloads of string URLs if requested multiple times.
     *
     * Note: This method merges multiple downloads of the same string URL to
     * only one request. The init parameter is ignored if the download is merged.
     * Call [[download]] instead to download the resource without merging.
     *
     * @param url - The URL or RequestInfo to download
     * @param init - Optional extra parameters for the download.
     */
    downloadJson<T>(url: RequestInfo, init?: RequestInit): Promise<T> {
        return this.downloadAs<T>(response => response.json(), url, init);
    }

    /**
     * Downloads a binary object. Merges downloads of string URLS if requested multiple times.
     *
     * Note: This method merges multiple downloads of the same string URL to
     * only one request. The init parameter is ignored if the download is merged.
     * Call [[download]] instead to download the resource without merging.
     *
     * @param url - The URL or RequestInfo to download
     * @param init - Optional extra parameters for the download
     */
    downloadArrayBuffer(url: RequestInfo, init?: RequestInit): Promise<ArrayBuffer> {
        return this.download(url, init).then(response => response.arrayBuffer());
    }

    /**
     * Downloads a URL and returns the response.
     *
     * Does not merge multiple requests to the same URL.
     *
     * @param url - The URL or RequestInfo to download.
     * @param init - Optional extra parameters for the download.
     */
    download(url: RequestInfo, init?: RequestInit): Promise<Response> {
        if (this.activeDownloadCount >= TransferManager.maxParallelDownloads) {
            const deferred = new DeferredPromise<Response>(() => this.doDownload(url, init));
            this.downloadQueue.push(deferred);
            return deferred.promise;
        }
        return this.doDownload(url, init);
    }

    private async doDownload(url: RequestInfo, init?: RequestInit): Promise<Response> {
        try {
            ++this.activeDownloadCount;
            const response = await TransferManager.fetchRepeatedly(
                this.fetchFunction,
                0,
                this.maxRetries,
                url,
                init
            );

            this.onDownloadDone();
            return response;
        } catch (error) {
            this.onDownloadDone();
            throw error;
        }
    }

    private onDownloadDone() {
        --this.activeDownloadCount;
        this.execDeferredDownload();
    }

    private execDeferredDownload() {
        const future = this.downloadQueue.pop();
        if (future === undefined) {
            return;
        }
        future.exec();
    }

    private downloadAs<T>(
        converter: (response: Response) => Promise<T>,
        url: RequestInfo,
        init?: RequestInit
    ): Promise<T> {
        const cacheKey = url;
        const pendingFetch = this.activeDownloads.get(cacheKey);
        if (pendingFetch !== undefined) {
            return Promise.resolve(pendingFetch);
        }
        const newFetch = this.download(url, init)
            .then(response => {
                this.activeDownloads.delete(cacheKey);
                if (response.ok) {
                    return converter(response);
                }
                throw new Error(JSON.stringify(response));
            })
            .catch(err => {
                this.activeDownloads.delete(cacheKey);
                throw err;
            });
        this.activeDownloads.set(cacheKey, newFetch);
        return newFetch;
    }
}
