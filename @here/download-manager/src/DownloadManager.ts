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
 * This module provides classes to ease downloading URLs. In particular, following redirects,
 * retrying on HTTP errors, and limiting the number of parallel concurrent downloads.
 */

import * as Fetch from "@here/fetch";

/**
 * `DeferredPromise` for using promise with added deffering mechanism.
 */
class DeferredPromise<T> {
    /**
     * Access to deferred task result. Underlying task is started only and only when [[exec]] is
     * invoked.
     */
    readonly promise: Promise<T>;
    private doExec = false;
    private resolveFunc?: (result?: T) => void;
    private rejectFunc?: (reason?: any) => void;

    constructor(private readonly executor: () => Promise<T>) {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolveFunc = resolve;
            this.rejectFunc = reject;

            if (this.doExec) {
                this.execInnerPromise(this.resolveFunc, this.rejectFunc);
            }
        });
    }

    /**
     * Executes a task. To access task result use [[promise]] property.
     */
    exec() {
        if (this.resolveFunc === undefined || this.rejectFunc === undefined) {
            // deferred promise not yet initialized - handle it in callback above
            this.doExec = true;
            return;
        }

        this.execInnerPromise(this.resolveFunc, this.rejectFunc);
    }

    private execInnerPromise(
        resolveFunc: (result?: T) => void,
        rejectFunc: (reason?: any) => void
    ) {
        this.executor()
            .then(result => resolveFunc(result))
            .catch(err => rejectFunc(err));
    }
}

/**
 * `DownloadManager` for downloading URLs.
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
export class DownloadManager {
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
     * Returns a default instance of [[DownloadManager]].
     */
    static instance(): DownloadManager {
        return DownloadManager.defaultInstance;
    }

    private static readonly defaultInstance = new DownloadManager();

    private static async fetchRepeatedly(
        fetch: Fetch.FetchFunction,
        retryCount: number,
        maxRetries: number,
        url: string,
        init?: Fetch.DownloadRequestInit
    ): Promise<Fetch.DownloadResponse> {
        try {
            const response = await fetch(url, init);
            if (response.status !== 503 || retryCount > maxRetries) {
                return response;
            }
        } catch (err) {
            if (err.hasOwnProperty("isCancelled") || retryCount > maxRetries) {
                throw err;
            }
        }

        return DownloadManager.waitFor(DownloadManager.retryTimeout * retryCount).then(() =>
            DownloadManager.fetchRepeatedly(fetch, maxRetries, retryCount + 1, url, init)
        );
    }

    private static waitFor(milliseconds: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
    }

    private activeDownloadCount = 0;
    private downloadQueue = new Array<DeferredPromise<Fetch.DownloadResponse>>();
    private activeDownloads = new Map<string, Promise<any>>();

    /**
     * Constructs a new [[DownloadManager]].
     *
     * @param fetch The default fetch function to use.
     * @param maxRetries The maximum amount to try to refetch a resource.
     */
    constructor(
        readonly fetch: Fetch.FetchFunction = Fetch.fetch,
        readonly maxRetries: number = 5
    ) {}

    /**
     * Downloads a JSON object. Merges downloads if requested multiple times.
     *
     * Note: This method merges multiple downloads of the same resource to
     * only one request. The init parameter is ignored if the download is merged.
     * Call [[download]] instead to download the resource without merging.
     *
     * @param url The URL to download
     * @param init Optional extra parameters for the download.
     */
    downloadJson<T>(url: string, init?: Fetch.DownloadRequestInit): Promise<T> {
        if (init === undefined) {
            init = { responseType: "json" };
        } else if (init.responseType === undefined) {
            init.responseType = "json";
        }
        return this.downloadAs<T>(response => response.json<T>(), url, init);
    }

    /**
     * Override this function to override downloading of a URL.
     *
     * @param url The URL to download.
     * @param init Optional extra parameters for the download.
     */
    download(url: string, init?: Fetch.DownloadRequestInit): Promise<Fetch.DownloadResponse> {
        if (this.activeDownloadCount >= DownloadManager.maxParallelDownloads) {
            const deferred = new DeferredPromise<Fetch.DownloadResponse>(() =>
                this.doDownload(url, init)
            );
            this.downloadQueue.push(deferred);
            return deferred.promise;
        }
        return this.doDownload(url, init);
    }

    private doDownload(
        url: string,
        init?: Fetch.DownloadRequestInit
    ): Promise<Fetch.DownloadResponse> {
        ++this.activeDownloadCount;

        return DownloadManager.fetchRepeatedly(this.fetch, 0, this.maxRetries, url, init)
            .then(response => {
                this.onDownloadDone();
                return response;
            })
            .catch(err => {
                this.onDownloadDone();
                throw err;
            });
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
        converter: (response: Fetch.DownloadResponse) => Promise<T>,
        url: string,
        init?: Fetch.DownloadRequestInit
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
