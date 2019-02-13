/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    WorkerDecoderProtocol,
    WorkerServiceProtocol,
    WorkerTilerProtocol
} from "@here/harp-datasource-protocol";

import {
    getOptionValue,
    IWorkerChannelMessage,
    LoggerManager,
    LogLevel,
    WORKERCHANNEL_MSG_TYPE
} from "@here/harp-utils";

import { WorkerLoader } from "./workers/WorkerLoader";

const logger = LoggerManager.instance.create("ConcurrentWorkerSet");

export function isLoggingMessage(message: IWorkerChannelMessage): message is IWorkerChannelMessage {
    return message && typeof message.level === "number" && message.type === WORKERCHANNEL_MSG_TYPE;
}

interface ReadyPromise {
    count: number;
    promise?: Promise<void>;
    resolve: () => void;
    reject: (reason: any) => void;
    error?: any;
}

interface RequestEntry {
    promise: Promise<any>;
    resolver: (error?: object, response?: object) => void;
}

export interface ConcurrentWorkerSetOptions {
    /**
     * The URL of the script for each worker to start.
     */
    scriptUrl: string;

    /**
     * The number of Web Workers for processing data.
     *
     * Defaults to `navigator.hardwareConcurrency` or [[DEFAULT_WORKER_COUNT]].
     */
    workerCount?: number;
}

/**
 * The default number of Web Workers to use if `navigator.hardwareConcurrency` is unavailable.
 */
const DEFAULT_WORKER_COUNT = 4;

/**
 * A set of concurrent Web Workers. Acts as a Communication Peer for [[WorkerService]] instances
 * running in Web Workers.
 *
 * Starts and manages a certain number of web workers and provides a means to communicate
 * with them using various communication schemes, such as:
 *  - [[addEventListener]] : receive a unidirectional messages
 *  - [[broadcastMessage]] : send unidirectional broadcast message
 *  - [[invokeRequest]] : send a request that waits for a response, with load balancing
 *  - [[postMessage]] : send a unidirectional message, with load balancing
 */
export class ConcurrentWorkerSet {
    private m_workerChannelLogger = LoggerManager.instance.create("WorkerChannel");
    private readonly m_eventListeners = new Map<string, (message: any) => void>();
    private m_workers = new Array<Worker>();
    private m_workerPromises = new Array<Promise<Worker>>();

    private readonly m_readyPromises = new Map<string, ReadyPromise>();
    private readonly m_requests: Map<number, RequestEntry> = new Map();

    private m_nextMessageId: number = 0;
    private m_stopped: boolean = true;

    private m_referenceCount: number = 0;

    /**
     * Creates a new `ConcurrentWorkerSet`.
     *
     * Creates as many Web Workers as specified in `options.workerCount`, from the script provided
     * in `options.scriptUrl`. If `options.workerCount` is not specified, the value specified in
     * `navigator.hardwareConcurrency` is used instead.
     *
     * The worker set is implicitly started when constructed.
     */
    constructor(private m_options: ConcurrentWorkerSetOptions) {
        this.start();
    }

    /**
     * Adds an external reference and increments the internal reference counter by one.
     *
     * To implement a reference-count based automatic resource cleanup, use this function with
     * [[removeReference]].
     */
    addReference() {
        this.m_referenceCount += 1;
    }

    /**
     * Decrements the internal reference counter by 1.
     *
     * When the internal reference counter reaches 0, this function calls [[dispose]] to clear the
     * resources.
     *
     * Use with [[addReference]] to implement reference-count based automatic resource cleanup.
     */
    removeReference() {
        this.m_referenceCount -= 1;
        if (this.m_referenceCount === 0) {
            this.destroy();
        }
    }

    /**
     * Starts workers.
     *
     * Use to start workers already stopped by [[stop]] or [[destroy]] calls.
     *
     * Note: The worker set is implicitly started on construction - no need to call [[start]] on
     * fresh instance.
     *
     * @param options optional, new worker set options
     */
    start(options?: ConcurrentWorkerSetOptions) {
        if (options !== undefined) {
            this.m_options = options;
        }
        if (!this.m_stopped) {
            throw new Error("ConcurrentWorker set already started");
        }

        const workerCount = getOptionValue(
            this.m_options.workerCount,
            typeof navigator !== "undefined" && navigator.hardwareConcurrency !== undefined
                ? Math.max(1, navigator.hardwareConcurrency) // we need to have at least one worker
                : undefined,
            DEFAULT_WORKER_COUNT
        );

        for (let i = 0; i < workerCount; ++i) {
            const workerPromise = WorkerLoader.startWorker(this.m_options.scriptUrl);
            workerPromise
                .then(worker => {
                    worker.addEventListener("message", this.onWorkerMessage);
                    this.m_workers.push(worker);
                })
                .catch(error => {
                    logger.error(`failed to load worker ${i}: ${error}`);
                });
            this.m_workerPromises.push(workerPromise);
        }
        this.m_stopped = false;
    }

    /**
     * Stops workers.
     *
     * Waits for all pending requests to be finished and stops all workers.
     *
     * Use [[start]] to start this worker again.
     *
     * @returns `Promise` that resolves when all workers are destroyed.
     */
    async stop() {
        this.m_stopped = true;

        await this.waitForAllResponses().then(() => {
            this.terminateWorkers();
        });
    }

    /**
     * Destroys all workers immediately.
     *
     * Resolves all pending request promises with a `worker destroyed` error.
     *
     * Use [[start]] to start this worker again.
     */
    destroy() {
        this.m_stopped = true;

        // respond with all pending request
        this.m_requests.forEach(entry => {
            entry.resolver(new Error("worker destroyed"));
        });
        this.m_requests.clear();

        this.terminateWorkers();

        // clean other stuff
        this.m_eventListeners.clear();
    }

    /**
     * Waits for `service` to be initialized in all workers.
     *
     * Each service that starts in a worker sends an [[isInitializedMessage]] to confirm that
     * it has started successfully. This method resolves when all workers in a set have
     * `service` initialized.
     *
     * @param serviceId The service identifier.
     */
    connect(serviceId: string): Promise<void> {
        this.ensureStarted();

        return this.getReadyPromise(serviceId).promise as Promise<void>;
    }

    /**
     * Registers an event listener for events that originated in a web worker, for a given
     * `serviceId`. You can only set one event listener per `serviceId`.
     *
     * @param serviceId The service to listen to.
     * @param callback The callback to invoke for matching events.
     */
    addEventListener(serviceId: string, callback: (message: any) => void) {
        this.m_eventListeners.set(serviceId, callback);
    }

    /**
     * Removes a previously set event listener for the given `serviceId`.
     *
     * @param serviceId The service from which to remove the event listeners.
     */
    removeEventListener(serviceId: string) {
        this.m_eventListeners.delete(serviceId);
    }

    /**
     * Invokes a request that expects a response from a random worker.
     *
     * Sends [[RequestMessage]] and resolves when a matching [[ResponseMessage]] is received from
     * workers. Use this function when interfacing with "RPC-like" calls to services.
     *
     * @param serviceId The name of service, as registered with the [[WorkerClient]] instance.
     * @param request The request to process.
     * @param transferList An optional array of `ArrayBuffer`s to transfer to the worker context.
     *
     * @returns A `Promise` that resolves with a response from the service.
     */
    invokeRequest<Res>(
        serviceId: string,
        request: WorkerServiceProtocol.ServiceRequest,
        transferList?: ArrayBuffer[]
    ): Promise<Res> {
        this.ensureStarted();

        const messageId = this.m_nextMessageId++;
        let resolver: ((error?: any, response?: any) => void) | undefined;

        const promise = new Promise<Res>((resolve, reject) => {
            resolver = (error, response) => {
                this.m_requests.delete(messageId);

                if (error !== undefined) {
                    reject(new Error(error.toString()));
                } else {
                    resolve(response as Res);
                }
            };
        });
        this.m_requests.set(messageId, {
            promise,
            resolver: resolver!
        });

        const message: WorkerServiceProtocol.RequestMessage = {
            service: serviceId,
            type: WorkerServiceProtocol.ServiceMessageName.Request,
            messageId,
            request
        };
        this.postMessage(message, transferList);
        return promise;
    }

    /**
     * Invokes a request that expects responses from all workers.
     *
     * Send [[RequestMessage]]  to all workers and resolves when all workers have sent a matching
     * [[ResponseMessage]]. Use this function to wait on request that need to happen on all workers
     * before proceeding (like synchronous worker service creation).
     *
     * @param serviceId The name of service, as registered with the [[WorkerClient]] instance.
     * @param request The request to process.
     * @param transferList An optional array of `ArrayBuffer`s to transfer to the worker context.
     *
     * @returns Array of `Promise`s that resolves with a response from each worker (unspecified
     * order).
     */
    broadcastRequest<Res>(
        serviceId: string,
        request:
            | WorkerServiceProtocol.WorkerServiceManagerRequest
            | WorkerServiceProtocol.ServiceRequest,
        transferList?: ArrayBuffer[]
    ): Promise<Res[]> {
        this.ensureStarted();

        const promises = [];
        for (const worker of this.m_workers) {
            const messageId = this.m_nextMessageId++;

            let resolver: ((error?: any, response?: any) => void) | undefined;
            const promise = new Promise<Res>((resolve, reject) => {
                resolver = (error, response) => {
                    this.m_requests.delete(messageId);

                    if (error !== undefined) {
                        reject(new Error(error.toString()));
                    } else {
                        resolve(response as Res);
                    }
                };
            });
            promises.push(promise);

            this.m_requests.set(messageId, {
                promise,
                resolver: resolver!
            });

            const message: WorkerServiceProtocol.RequestMessage = {
                service: serviceId,
                type: WorkerServiceProtocol.ServiceMessageName.Request,
                messageId,
                request
            };
            worker.postMessage(message, transferList);
        }

        return Promise.all(promises);
    }

    /**
     * Posts a message to a random worker.
     *
     * @param message The message to send.
     * @param buffers Optional buffers to transfer to the worker.
     */
    postMessage(
        message: WorkerServiceProtocol.ServiceMessage,
        buffers?: ArrayBuffer[] | undefined
    ) {
        this.ensureStarted();
        if (this.m_workers.length === 0) {
            throw new Error("ConcurrentWorkerSet#postMessage: no workers started");
        }

        const index = Math.floor(Math.random() * this.m_workers.length);
        this.m_workers[index].postMessage(message, buffers);
    }

    /**
     * Posts a message to all workers.
     *
     * @param message The message to send.
     * @param buffers Optional buffers to transfer to the workers.
     */
    broadcastMessage(message: any, buffers?: ArrayBuffer[] | undefined) {
        this.ensureStarted();

        this.m_workers.forEach(worker => worker.postMessage(message, buffers));
    }

    /**
     * Subclasses must call this function when a worker emits an event.
     *
     * @param event The event to dispatch.
     */
    protected eventHandler(event: any) {
        if (typeof event.data.type !== "string") {
            return; // not an event generated by us, ignore.
        }

        this.dispatchEvent(event.data.type, event);
    }

    /**
     * Handles messages received from workers. This method is protected so that the message
     * reception can be simulated through an extended class, to avoid relying on real workers.
     *
     * @param event The event to dispatch.
     */
    protected onWorkerMessage = (event: MessageEvent) => {
        if (WorkerServiceProtocol.isResponseMessage(event.data)) {
            const response = event.data;
            if (response.messageId === null) {
                logger.error(`[${this.m_options.scriptUrl}]: Bad ResponseMessage: no messageId`);
                return;
            }
            const entry = this.m_requests.get(response.messageId);
            if (entry === undefined) {
                logger.error(
                    `[${this.m_options.scriptUrl}]: Bad ResponseMessage: invalid messageId`
                );
                return;
            }
            entry.resolver(response.error, response.response);
        } else if (WorkerServiceProtocol.isInitializedMessage(event.data)) {
            const readyPromise = this.getReadyPromise(event.data.service);
            if (++readyPromise.count === this.m_workerPromises.length) {
                readyPromise.resolve();
            }
        } else if (isLoggingMessage(event.data)) {
            switch (event.data.level) {
                case LogLevel.Trace:
                    this.m_workerChannelLogger.trace(...event.data.message);
                    break;
                case LogLevel.Debug:
                    this.m_workerChannelLogger.debug(...event.data.message);
                    break;
                case LogLevel.Log:
                    this.m_workerChannelLogger.log(...event.data.message);
                    break;
                case LogLevel.Info:
                    this.m_workerChannelLogger.info(...event.data.message);
                    break;
                case LogLevel.Warn:
                    this.m_workerChannelLogger.warn(...event.data.message);
                    break;
                case LogLevel.Error:
                    this.m_workerChannelLogger.error(...event.data.message);
                    break;
            }
        } else {
            this.eventHandler(event);
        }
    };

    private ensureStarted() {
        if (this.m_stopped) {
            throw new Error("ConcurrentWorkerSet stopped");
        }
    }

    private async waitForAllResponses(): Promise<any> {
        const promises = new Array<Promise<void>>();
        this.m_requests.forEach(entry => {
            promises.push(entry.promise);
        });
        await Promise.all(promises);
    }

    private dispatchEvent(id: string, message: any) {
        const callback = this.m_eventListeners.get(id);
        if (callback === undefined) {
            return;
        } // unknown event, ignore.
        callback(message);
    }

    private terminateWorkers() {
        // terminate all workers
        this.m_workerPromises.forEach(workerPromise => {
            workerPromise
                .then(worker => {
                    worker.removeEventListener("message", this.onWorkerMessage);
                    worker.terminate();
                })
                .catch(() => {
                    // we ignore exception here, as it's already logged in #start and terminate is
                    // noop if worker didn't start at all
                });
        });
        this.m_workers = [];
        this.m_workerPromises = [];
        this.m_readyPromises.clear();
    }

    private getReadyPromise(id: string): ReadyPromise {
        const readyPromise = this.m_readyPromises.get(id);
        if (readyPromise !== undefined) {
            return readyPromise;
        }

        const newPromise: ReadyPromise = {
            count: 0,
            promise: undefined,
            resolve: () => {
                /* placeholder */
            },
            reject: (error: any) => {
                newPromise.error = error;
            },
            error: undefined
        };

        newPromise.promise = new Promise<void>((resolve, reject) => {
            const that = newPromise;

            if (that.error !== undefined) {
                reject(that.error);
            } else if (that.count === this.m_workerPromises.length) {
                resolve();
            }

            that.resolve = resolve;
            that.reject = reject;
        });

        this.m_readyPromises.set(id, newPromise);
        return newPromise;
    }
}
