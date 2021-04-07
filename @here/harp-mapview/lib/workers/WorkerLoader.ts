/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "@here/harp-fetch";

import { getUrlOrigin, LoggerManager } from "@here/harp-utils";

import { isWorkerBootstrapRequest, WorkerBootstrapResponse } from "./WorkerBootstrapDefs";

const logger = LoggerManager.instance.create("WorkerLoader");

/**
 * Set of `Worker` loading and initialization helpers:
 *  - starting Worker from URL with fallback to XHR+blob {@link WorkerLoader.startWorker}
 *  - waiting for proper worker initialization, see {@link WorkerLoader.waitWorkerInitialized}
 */
export class WorkerLoader {
    static directlyFallbackToBlobBasedLoading: boolean = false;
    static sourceLoaderCache = new Map<string, Promise<string>>();
    static dependencyUrlMapping: { [name: string]: string } = {};

    /**
     * Starts worker by first attempting load from `scriptUrl` using native `Worker` constructor.
     * Then waits (using [[waitWorkerInitialized]]) for first message that indicates successful
     * initialization.
     * If `scriptUrl`'s origin is different than `baseUrl`, then in case of error falls back to
     * [[startWorkerBlob]].
     *
     * We must resolve/reject promise at some time, so it is expected that any sane application will
     * be able to load worker code in some amount of time.
     * By default, this method timeouts after 10 seconds (configurable using `timeout` argument).
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
     * @param scriptUrl - web worker script URL
     * @param timeout - timeout in milliseconds, in which worker should set initial message
     *    (default 10 seconds)
     */
    static startWorker(scriptUrl: string, timeout: number = 10000): Promise<Worker> {
        if (scriptUrl.startsWith("blob:")) {
            return this.startWorkerImmediately(scriptUrl, timeout);
        }

        if (this.directlyFallbackToBlobBasedLoading) {
            return this.startWorkerBlob(scriptUrl, timeout);
        }
        return this.startWorkerImmediately(scriptUrl, timeout).catch(error => {
            if (typeof window !== "undefined") {
                const pageUrl = window.location.href;
                const fullScriptUrl = new URL(scriptUrl, pageUrl).href;
                if (getUrlOrigin(fullScriptUrl) === getUrlOrigin(pageUrl)) {
                    throw error;
                }
                logger.log(
                    "#startWorker: cross-origin worker construction failed, trying load with blob"
                );
                this.directlyFallbackToBlobBasedLoading = true;
                return WorkerLoader.startWorkerBlob(scriptUrl, timeout);
            } else {
                throw error;
            }
        });
    }

    /**
     * Start worker, loading it immediately from `scriptUrl`. Waits (using
     * [[waitWorkerInitialized]]) for successful worker start.
     *
     * @param scriptUrl - web worker script URL
     */
    static startWorkerImmediately(scriptUrl: string, timeout: number): Promise<Worker> {
        try {
            const worker = new Worker(scriptUrl);
            return this.waitWorkerInitialized(worker, timeout);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Start worker "via blob" by first loading worker script code with [[fetch]], creating `Blob`
     * and attempting to start worker from blob url. Waits (using [[waitWorkerInitialized]]) for
     * successful worker start.
     *
     * @param scriptUrl - web worker script URL
     */
    static startWorkerBlob(scriptUrl: string, timeout: number): Promise<Worker> {
        return this.fetchScriptSourceToBlobUrl(scriptUrl).then(blobUrl => {
            return this.startWorkerImmediately(blobUrl, timeout);
        });
    }

    /**
     * Fetch script source as `Blob` url.
     *
     * Reuses results, if there are many simultaneous requests.
     *
     * @param scriptUrl - web worker script URL
     * @return promise that resolves to url of a `Blob` with script source code
     */
    static fetchScriptSourceToBlobUrl(scriptUrl: string): Promise<string> {
        let loadingPromise = this.sourceLoaderCache.get(scriptUrl);
        if (loadingPromise !== undefined) {
            return loadingPromise;
        }
        loadingPromise = fetch(scriptUrl)
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
     * Waits for successful Web Worker start.
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
     * `dispatchEvent`, so application code can also consume it as confirmation of successful
     * worker initialization.
     *
     * We must resolve/reject promise at some time, so it is expected that any sane application will
     * be able to load worker code in some amount of time.
     *
     * @param worker - [[Worker]] instance to be checked
     * @param timeout - timeout in milliseconds, in which worker should set initial message
     * @returns `Promise` that resolves to `worker` on success
     */
    static waitWorkerInitialized(worker: Worker, timeout: number): Promise<Worker> {
        return new Promise<Worker>((resolve, reject) => {
            const firstMessageCallback = (event: MessageEvent) => {
                const message = event.data;
                if (isWorkerBootstrapRequest(message)) {
                    const dependencies = message.dependencies;
                    const resolvedDependencies: string[] = [];
                    for (const dependency of dependencies) {
                        const resolved = this.dependencyUrlMapping[dependency];
                        if (!resolved) {
                            cleanup();
                            reject(
                                new Error(
                                    `#waitWorkerInitialized: Unable to resolve '${dependency}'` +
                                        ` as needed by worker script.`
                                )
                            );
                            return;
                        }
                        resolvedDependencies.push(resolved);
                    }
                    const response: WorkerBootstrapResponse = {
                        type: "worker-bootstrap-response",
                        resolvedDependencies
                    };
                    worker.postMessage(response);
                    return;
                }

                cleanup();
                resolve(worker);

                // We've just consumed first message from worker before client has any chance to
                // even call `addEventListener` on it, so here after resolve, we wait next tick and
                // replay message so user has chance to intercept it in its own handler.
                setTimeout(() => {
                    worker.dispatchEvent(event);
                }, 0);
            };
            const errorCallback = (error: ErrorEvent) => {
                cleanup();
                // Error events do not carry any useful information on tested browsers, so we assume
                // that any error before 'firstMessageCallback' as failed Worker initialization.
                let message = "Error during worker initialization";
                if (error.message) {
                    message = message + `: ${error.message}`;
                }
                if (typeof error.filename === "string" && typeof error.lineno === "number") {
                    message = message + ` in ${error.filename}:${error.lineno}`;
                }
                reject(new Error(message));
            };
            const cleanup = () => {
                clearTimeout(timerId);
                worker.removeEventListener("message", firstMessageCallback);
                worker.removeEventListener("error", errorCallback);
            };

            worker.addEventListener("error", errorCallback);
            worker.addEventListener("message", firstMessageCallback);
            const timerId = setTimeout(() => {
                cleanup();
                reject(new Error("Timeout exceeded when waiting for first message from worker."));
            }, timeout);
        });
    }
}
