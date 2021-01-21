/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { RequestController, WorkerServiceProtocol } from "@here/harp-datasource-protocol";
import {
    getOptionValue,
    IWorkerChannelMessage,
    LoggerManager,
    LogLevel,
    WORKERCHANNEL_MSG_TYPE
} from "@here/harp-utils";
import * as THREE from "three";

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
    resolver: (error?: Error, response?: object) => void;
}

export interface ConcurrentWorkerSetOptions {
    /**
     * The URL of the script for each worker to start.
     */
    scriptUrl: string;

    /**
     * The number of Web Workers for processing data.
     *
     * Defaults to CLAMP(`navigator.hardwareConcurrency` - 1, 1, 4) or [[DEFAULT_WORKER_COUNT]].
     */
    workerCount?: number;

    /**
     * Timeout in milliseconds, in which each worker should set initial message.
     *
     * @default 10 seconds, see [[DEFAULT_WORKER_INITIALIZATION_TIMEOUT]]
     */
    workerConnectionTimeout?: number;
}

/**
 * Interface for an item in the started worker list queue.
 */
interface WorkerEntry {
    worker: Worker;
    listener: EventListener;
}

/**
 * Interface for an item in the request queue. Stores the data to be decoded along with an
 * [[AbortController]].
 */
interface WorkerRequestEntry {
    message: WorkerServiceProtocol.RequestMessage;
    buffers?: ArrayBuffer[] | undefined;
    requestController?: RequestController;
}

/**
 * The default number of Web Workers to use if `navigator.hardwareConcurrency` is unavailable.
 */
const DEFAULT_WORKER_COUNT = 2;

/**
 * The default timeout for first message from worker.
 *
 * @see {@link WorkerLoader.startWorker}
 */
export const DEFAULT_WORKER_INITIALIZATION_TIMEOUT = 10000;

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
 *
 * The request queue holds all requests before they are stuffed into the event queue, allows for
 * easy (and early) cancelling of requests. The workers now only get a single new RequestMessage
 * when they return their previous result, or if they are idle. When they are idle, they are stored
 * in m_availableWorkers.
 */
export class ConcurrentWorkerSet {
    private readonly m_workerChannelLogger = LoggerManager.instance.create("WorkerChannel");
    private readonly m_eventListeners = new Map<string, (message: any) => void>();
    private m_workers = new Array<Worker>();

    // List of idle workers that can be given the next job. It is using a LIFO scheme to reduce
    // memory consumption in idle workers.
    private m_availableWorkers = new Array<Worker>();
    private m_workerPromises = new Array<Promise<WorkerEntry | undefined>>();
    private m_workerCount: number | undefined;

    private readonly m_readyPromises = new Map<string, ReadyPromise>();
    private readonly m_requests: Map<number, RequestEntry> = new Map();
    private m_workerRequestQueue: WorkerRequestEntry[] = [];

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
        if (this.m_referenceCount === 1 && this.m_stopped) {
            this.start();
        }
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
     * @param options - optional, new worker set options
     */
    start(options?: ConcurrentWorkerSetOptions) {
        if (options !== undefined) {
            this.m_options = options;
        }
        if (!this.m_stopped) {
            throw new Error("ConcurrentWorker set already started");
        }

        this.m_workerCount = getOptionValue(
            this.m_options.workerCount,
            typeof navigator !== "undefined" && navigator.hardwareConcurrency !== undefined
                ? // We need to have at least one worker
                  THREE.MathUtils.clamp(navigator.hardwareConcurrency - 1, 1, 2)
                : undefined,
            DEFAULT_WORKER_COUNT
        );

        // Initialize the workers. The workers now have an ID to identify specific workers and
        // handle their busy state.
        const timeout = getOptionValue(
            this.m_options.workerConnectionTimeout,
            DEFAULT_WORKER_INITIALIZATION_TIMEOUT
        );
        for (let workerId = 0; workerId < this.m_workerCount; ++workerId) {
            const workerPromise = WorkerLoader.startWorker(this.m_options.scriptUrl, timeout).then(
                worker => {
                    const listener = (evt: Event): void => {
                        this.onWorkerMessage(workerId, evt as MessageEvent);
                    };

                    worker.addEventListener("message", listener);
                    this.m_workers.push(worker);
                    this.m_availableWorkers.push(worker);
                    return {
                        worker,
                        listener
                    };
                }
            );
            this.m_workerPromises.push(workerPromise);
        }
        this.m_stopped = false;
    }

    /**
     * The number of workers started for this worker set. The value is `undefined` until the workers
     * have been created.
     */
    get workerCount(): number | undefined {
        return this.m_workerCount;
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
        this.m_workerRequestQueue = [];

        this.terminateWorkers();

        // clean other stuff
        this.m_eventListeners.clear();
    }

    /**
     * Is `true` if the workers have been terminated.
     */
    get terminated(): boolean {
        return this.m_workers.length === 0;
    }

    /**
     * Waits for `service` to be initialized in all workers.
     *
     * Each service that starts in a worker sends an [[isInitializedMessage]] to confirm that
     * it has started successfully. This method resolves when all workers in a set have
     * `service` initialized.
     *
     * Promise is rejected if any of worker fails to start.
     *
     * @param serviceId - The service identifier.
     */
    async connect(serviceId: string): Promise<void> {
        this.ensureStarted();
        await Promise.all(this.m_workerPromises);
        return await this.getReadyPromise(serviceId).promise;
    }

    /**
     * Registers an event listener for events that originated in a web worker, for a given
     * `serviceId`. You can only set one event listener per `serviceId`.
     *
     * @param serviceId - The service to listen to.
     * @param callback - The callback to invoke for matching events.
     */
    addEventListener(serviceId: string, callback: (message: any) => void) {
        this.m_eventListeners.set(serviceId, callback);
    }

    /**
     * Removes a previously set event listener for the given `serviceId`.
     *
     * @param serviceId - The service from which to remove the event listeners.
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
     * @param serviceId - The name of service, as registered with the [[WorkerClient]] instance.
     * @param request - The request to process.
     * @param transferList - An optional array of `ArrayBuffer`s to transfer to the worker context.
     * @param requestController - An optional [[RequestController]] to store state of cancelling.
     *
     * @returns A `Promise` that resolves with a response from the service.
     */
    invokeRequest<Res>(
        serviceId: string,
        request: WorkerServiceProtocol.ServiceRequest,
        transferList?: ArrayBuffer[],
        requestController?: RequestController
    ): Promise<Res> {
        this.ensureStarted();

        const messageId = this.m_nextMessageId++;
        let resolver: ((error?: any, response?: any) => void) | undefined;

        const promise = new Promise<Res>((resolve, reject) => {
            resolver = (error?: Error, response?: Res) => {
                this.m_requests.delete(messageId);

                if (error !== undefined) {
                    reject(error);
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
        this.postRequestMessage(message, transferList, requestController);
        return promise;
    }

    /**
     * Invokes a request that expects responses from all workers.
     *
     * Send [[RequestMessage]]  to all workers and resolves when all workers have sent a matching
     * [[ResponseMessage]]. Use this function to wait on request that need to happen on all workers
     * before proceeding (like synchronous worker service creation).
     *
     * @param serviceId - The name of service, as registered with the [[WorkerClient]] instance.
     * @param request - The request to process.
     * @param transferList - An optional array of `ArrayBuffer`s to transfer to the worker context.
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
        const promises = [];
        for (const worker of this.m_workers) {
            const messageId = this.m_nextMessageId++;

            let resolver: ((error?: any, response?: any) => void) | undefined;
            const promise = new Promise<Res>((resolve, reject) => {
                resolver = (error: Error, response: Res) => {
                    this.m_requests.delete(messageId);

                    if (error !== undefined) {
                        reject(error);
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
            if (transferList !== undefined) {
                worker.postMessage(message, transferList);
            } else {
                worker.postMessage(message);
            }
        }

        return Promise.all(promises);
    }

    /**
     * Posts a message to all workers.
     *
     * @param message - The message to send.
     * @param buffers - Optional buffers to transfer to the workers.
     */
    broadcastMessage(message: any, buffers?: ArrayBuffer[] | undefined) {
        this.ensureStarted();

        if (buffers !== undefined) {
            this.m_workers.forEach(worker => worker.postMessage(message, buffers));
        } else {
            this.m_workers.forEach(worker => worker.postMessage(message));
        }
    }

    /**
     * The size of the request queue for debugging and profiling.
     */
    get requestQueueSize() {
        return this.m_workerRequestQueue.length;
    }

    /**
     * The number of workers for debugging and profiling.
     */
    get numWorkers() {
        return this.m_workers.length;
    }

    /**
     * The number of workers for debugging and profiling.
     */
    get numIdleWorkers() {
        return this.m_availableWorkers.length;
    }

    /**
     * Subclasses must call this function when a worker emits an event.
     *
     * @param event - The event to dispatch.
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
     * @param workerId - The workerId of the web worker.
     * @param event - The event to dispatch.
     */
    private readonly onWorkerMessage = (workerId: number, event: MessageEvent) => {
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

            if (workerId >= 0 && workerId < this.m_workers.length) {
                const worker = this.m_workers[workerId];
                this.m_availableWorkers.push(worker);
                // Check if any new work has been put into the queue.
                this.checkWorkerRequestQueue();
            } else {
                logger.error(`[${this.m_options.scriptUrl}]: onWorkerMessage: invalid workerId`);
            }
            if (response.errorMessage !== undefined) {
                const error = new Error(response.errorMessage);
                if (response.errorStack !== undefined) {
                    error.stack = response.errorStack;
                }
                entry.resolver(error);
            } else {
                entry.resolver(undefined, response.response);
            }
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

    /**
     * Posts a [[WorkerServiceProtocol.RequestMessage]] to an available worker. If no worker is
     * available, the request is put into a queue.
     *
     * @param message - The message to send.
     * @param buffers - Optional buffers to transfer to the worker.
     * @param requestController - An optional [[RequestController]] to store state of cancelling.
     */
    private postRequestMessage(
        message: WorkerServiceProtocol.RequestMessage,
        buffers?: ArrayBuffer[] | undefined,
        requestController?: RequestController
    ) {
        this.ensureStarted();
        if (this.m_workers.length === 0) {
            throw new Error("ConcurrentWorkerSet#postMessage: no workers started");
        }

        // Check if the requestController has received the abort signal, in which case the request
        // is ignored.
        if (requestController !== undefined && requestController.signal.aborted) {
            const entry = this.m_requests.get(message.messageId);
            if (entry === undefined) {
                logger.error(
                    `[${this.m_options.scriptUrl}]: Bad RequestMessage: invalid messageId`
                );
                return;
            }

            const err = new Error("Aborted");
            err.name = "AbortError";

            entry.resolver(err, undefined);
            return;
        }

        if (this.m_availableWorkers.length > 0) {
            const worker = this.m_availableWorkers.pop()!;

            if (buffers !== undefined) {
                worker.postMessage(message, buffers);
            } else {
                worker.postMessage(message);
            }
        } else {
            // We need a priority to keep sorting stable, so we have to add a RequestController.
            if (requestController === undefined) {
                requestController = new RequestController(0);
            }
            if (requestController.priority === 0) {
                // If the requests do not get a priority, they should keep their sorting order.
                requestController.priority = -this.m_nextMessageId;
            }
            this.m_workerRequestQueue.unshift({
                message,
                buffers,
                requestController
            });
        }
    }

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
            workerPromise.then(workerEntry => {
                if (workerEntry === undefined) {
                    return;
                }
                workerEntry.worker.removeEventListener("message", workerEntry.listener);
                workerEntry.worker.terminate();
            });
        });
        this.m_workers = [];
        this.m_workerPromises = [];
        this.m_availableWorkers = [];
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

    /**
     * Check the worker request queue, if there are any queued up decoding jobs and idle workers,
     * they will be executed with postRequestMessage. The requests in the queue are sorted before
     * the request with the highest priority is selected for processing.
     */
    private checkWorkerRequestQueue() {
        if (this.m_workerRequestQueue.length === 0 || this.m_availableWorkers.length === 0) {
            return;
        }
        this.m_workerRequestQueue.sort((a: WorkerRequestEntry, b: WorkerRequestEntry) => {
            return a.requestController!.priority - b.requestController!.priority;
        });

        // Get the request with the highest priority and send it (again).
        while (this.m_availableWorkers.length > 0 && this.m_workerRequestQueue.length > 0) {
            const request = this.m_workerRequestQueue.pop()!;
            this.postRequestMessage(request.message, request.buffers, request.requestController);
        }
    }
}
