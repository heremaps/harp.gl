/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { fetch } from "@here/fetch";

import { LoggerManager } from "@here/utils";

const logger = LoggerManager.instance.create("WorkerLoader");

/**
 * Set of `Worker` loading and initialization helpers:
 *  - starting Worker from URL with fallback to XHR+blob [[WorkerLoader.startWorker]]
 *  - waiting for proper worker initialization, see [[WorkerLoader.waitWorkerInitialized]]
 */
export class WorkerLoader {
    static directlyFallbackToBlobBasedLoading: boolean = false;
    static sourceLoaderCache = new Map<string, Promise<string>>();

    /**
     * Starts worker by first attempting load from `scriptUrl` using native `Worker` constructor.
     * Then waits (using [[waitWorkerInitialized]]) for its successfull initialization. In case of
     * error falls back to [[startWorkerBlob]].
     *
     * This method is needed as browsers in general forbid to load worker if it's not on 'same
     * origin' regardless of Content-Security-Policy.
     *
     * For blob-based fallback work, one need to ensure that Content Security Policy (CSP) allows
     * loading web worker code from `Blob`s. By default browsers, allow 'blob:' for workers, but
     * this may change.
     *
     * Following snippet setups CSP, so workers can be started from blob urls:
     *
     *     <head>
     *         <meta http-equiv="Content-Security-Policy" content="child-src blob:">
     *     </head>
     *
     * Tested on:
     *   * Chrome 67 / Linux, Window, OSX, Android
     *   * Firefox 60 / Linux, Windows, OSX
     *   * Edge 41 / Windows
     *   * Safari 11 / OSX
     *   * Samsung Internet 7.2
     *
     * See
     *  * https://benohead.com/cross-domain-cross-browser-web-workers/
     *  * MapBox
     *    * https://stackoverflow.com/questions/21913673/execute-web-worker-from-different-origin
     *    * https://github.com/mapbox/mapbox-gl-js/issues/2658
     *    * https://github.com/mapbox/mapbox-gl-js/issues/559
     *    * https://github.com/mapbox/mapbox-gl-js/issues/6058
     *
     * Findings:
     *
     * * Chrome reports CSP by exception when constructing [[Worker]] instance.
     * * Firefox reports CSP errors when loading in first event:
     *   https://bugzilla.mozilla.org/show_bug.cgi?id=1241888
     * * Firefox 62, Chrome 67 obeys `<meta http-equiv="Content-Security-Policy">` with
     *   `worker-src blob:` but doesn't obey `worker-src URL` when used
     * * Chrome 67 doesn't obey CSP `worker-src URL` despite it's documented as supported
     *   (https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/worker-src)
     *
     * @param scriptUrl web worker script URL
     */
    static startWorker(scriptUrl: string): Promise<Worker> {
        if (scriptUrl.startsWith("blob:")) {
            return this.startWorkerImmediately(scriptUrl);
        }

        if (this.directlyFallbackToBlobBasedLoading) {
            return this.startWorkerBlob(scriptUrl);
        }
        return this.startWorkerImmediately(scriptUrl).catch(error => {
            logger.log(
                "#startWorker: worker construction failed, attempting load with blob"
            );
            this.directlyFallbackToBlobBasedLoading = true;
            return WorkerLoader.startWorkerBlob(scriptUrl);
        });
    }

    /**
     * Start worker, loading it immediately from `scriptUrl`. Waits (using
     * [[waitWorkerInitialized]]) for successfull worker start.
     *
     * @param scriptUrl web worker script URL
     */
    static startWorkerImmediately(scriptUrl: string): Promise<Worker> {
        try {
            const worker = new Worker(scriptUrl);
            return this.waitWorkerInitialized(worker);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Start worker "via blob" by first loading worker script code with [[fetch]], creating `Blob`
     * and attempting to start worker from blob url. Waits (using [[waitWorkerInitialized]]) for
     * successfull worker start.
     *
     * @param scriptUrl web worker script URL
     */
    static startWorkerBlob(scriptUrl: string): Promise<Worker> {
        return this.fetchScriptSourceToBlobUrl(scriptUrl).then(blobUrl => {
            return this.startWorkerImmediately(blobUrl);
        });
    }

    /**
     * Fetch script source as `Blob` url.
     *
     * Reuses results, if there are many simultaneous requests.
     *
     * @param scriptUrl web worker script URL
     * @return promise that resolves to url of a `Blob` with script source code
     */
    static fetchScriptSourceToBlobUrl(scriptUrl: string): Promise<string> {
        let loadingPromise = this.sourceLoaderCache.get(scriptUrl);
        if (loadingPromise !== undefined) {
            return loadingPromise;
        }
        loadingPromise = fetch(scriptUrl, {responseType: 'text'})
            .then(response => response.text())
            .catch(error => {
                throw new Error(
                    `WorkerLoader#fetchScriptSourceToBlob: failed to load worker script: ${error}`
                );
            })
            .then(scriptSource => {
                this.sourceLoaderCache.delete(scriptUrl);
                const blob = new Blob([scriptSource], { type: "application/javascript" });
                return URL.createObjectURL(blob);
            });
        this.sourceLoaderCache.set(scriptUrl, loadingPromise);
        return loadingPromise;
    }

    /**
     * Waits for successfull Web Worker start.
     *
     * Expects that worker script sends initial message.
     *
     * If first event is `message` then assumes that worker has been loaded sussesfully and promise
     * resolves to `worker` object passed as argument.
     *
     * If first event is 'error', then it is assumed that worker failed to load and promise is
     * rejected.
     *
     * (NOTE: The initial 'message' - if received - is immediately replayed using worker's
     * `dispatchEvent`, so application code can also consume it as confirmation of successfull
     * worker initialization.
     *
     * @param worker [[Worker]] instance to be checked
     * @returns `Promise` that resolves to `worker` on success
     */
    static waitWorkerInitialized(worker: Worker): Promise<Worker> {
        return new Promise<Worker>((resolve, reject) => {
            const firstMessageCallback = (event: MessageEvent) => {
                worker.removeEventListener("message", firstMessageCallback);
                worker.removeEventListener("error", errorCallback);
                resolve(worker);

                // We've just consumed first message from worker before client has any chance to
                // even call `addEventListener` on it, so here after resolve, we wait next tick and
                // replay message so user has chance to intercept it in its own handler.
                setTimeout(() => {
                    worker.dispatchEvent(event);
                }, 0);
            };
            const errorCallback = (error: ErrorEvent) => {
                // Error events do not carry any useful information on tested browsers, so we assume
                // that any error before 'firstMessageCallback' as failed Worker initialization.
                worker.removeEventListener("message", firstMessageCallback);
                worker.removeEventListener("error", errorCallback);
                reject(new Error("#waitWorkerInitialized: Error event before first message."));
            };
            worker.addEventListener("message", firstMessageCallback);
            worker.addEventListener("error", errorCallback);
        });
    }
}
