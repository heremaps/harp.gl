/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import {
    DecodedTileMessageName,
    InitializedMessage,
    isConfigurationMessage,
    isRequestMessage,
    ResponseMessage
} from "@here/datasource-protocol";
import { LoggerManager } from "@here/utils";

const logger = LoggerManager.instance.create("WorkerService", { enabled: false });

declare let self: Worker;

/**
 * Response for [[WorkerService]] procession results.
 */
export interface WorkerServiceResponse {
    /**
     * Response object.
     */
    response: any;

    /**
     * Transfer list containing a list of [[ArrayBuffer]] which transfer ownership from web worker
     * to UI thread.
     */
    transferList?: ArrayBuffer[];
}

/**
 * Header information for a [[RequestMessage]].
 */
interface RequestEntry {
    /**
     * ID of service.
     */
    service: string;

    /**
     * Unique ID of message.
     */
    messageId: number;

    /**
     * Contains `true` if message has been processed, and response has been sent.
     */
    responseSent: boolean;
}

/**
 * Worker Service communication helper.
 *
 * Listens to Web Worker messages from [[ConcurrentWorkerSet]] and implements:
 *  - worker service initialization
 *  - request/respone scheme
 *  - error handling.
 *
 * This class should be subclassed to provide concrete like [[TileDecoderService]].
 *
 * Communication peer for [[ConcurrentWorkerSet]].
 */
export abstract class WorkerService {
    private m_pendingRequests: Map<number, RequestEntry> = new Map();

    /**
     * Sets up the `WorkerService` with the specified name, and starts processing messages.
     *
     * @param serviceId The service id.
     */
    constructor(readonly serviceId: string) {
        self.addEventListener("message", this.onMessage);

        const isInitializedMessage: InitializedMessage = {
            service: serviceId,
            type: DecodedTileMessageName.Initialized
        };
        self.postMessage(isInitializedMessage);
    }

    /**
     * Destroy the `WorkerService`. Cancels all pending requests ad removes itself from the message
     * queue.
     */
    destroy() {
        this.cancelAllPendingRequests();

        self.removeEventListener("message", this.onMessage);
    }

    /**
     * Message handler to be overridden by implementation.
     *
     * @param message `MessageEvent.data` as received by `WorkerService`.
     */
    protected handleMessage(message: any): void {
        logger.error(`[${this.serviceId}]: Invalid message ${message.type}`);
    }

    /**
     * Call request handler to be overridden by implementation.
     *
     * @param request [[RequestMessage.request]] as received by `WorkerService`.
     */
    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        throw new Error(`ServiceAdapter[${this.serviceId}]: Invalid request '${request.type}'`);
    }

    /**
     * Central message handler for this service.
     *
     * Responsible for filtering message target and managing request/response sequence.
     *
     * @param message Message to be dispatched.
     */
    private onMessage = (message: MessageEvent) => {
        if (typeof message.data.service !== "string" || message.data.service !== this.serviceId) {
            return;
        }

        try {
            if (isRequestMessage(message.data)) {
                const request = message.data;
                const requestEntry = {
                    service: request.service,
                    messageId: request.messageId,
                    responseSent: false
                };
                this.m_pendingRequests.set(request.messageId, requestEntry);
                this.tryHandleRequest(request.request)
                    .then(response => {
                        this.doSendResponse(
                            requestEntry,
                            {
                                service: this.serviceId,
                                type: DecodedTileMessageName.Response,
                                messageId: request.messageId,
                                response: response.response
                            },
                            response.transferList
                        );
                    })
                    .catch(error => {
                        this.doSendResponse(requestEntry, {
                            service: this.serviceId,
                            type: DecodedTileMessageName.Response,
                            messageId: request.messageId,
                            error: error.toString()
                        });
                    });
            } else if (isConfigurationMessage(message.data)) {
                this.tryHandleMessage(message.data);
            }
        } catch (err) {
            logger.error(`[${this.serviceId}]: Unhandled exception when handling ${message.type}`);
        }
    };

    /**
     * Safety belt over [[handleMessage]] for correct exception handling & logging.
     */
    private tryHandleMessage(message: any): void {
        try {
            this.handleMessage(message);
        } catch (error) {
            logger.error(`[${this.serviceId}]: Failed, handling message ${message.type}`);
        }
    }

    /**
     * Safety belt over [[handleRequest]] for correct exception handling in promise chain.
     */
    private tryHandleRequest(request: any): Promise<WorkerServiceResponse> {
        try {
            return this.handleRequest(request);
        } catch (error) {
            // we don't log exceptions here as they are propagated to client as responses
            logger.error(`[${this.serviceId}]: Failure`, error);
            return Promise.reject(error);
        }
    }

    private doSendResponse(
        requestEntry: RequestEntry,
        response: ResponseMessage,
        transferList?: ArrayBuffer[]
    ) {
        if (requestEntry.responseSent) {
            return;
        }

        self.postMessage(response, transferList);

        requestEntry.responseSent = true;
        this.m_pendingRequests.delete(requestEntry.messageId);
    }

    private cancelAllPendingRequests() {
        this.m_pendingRequests.forEach(requestEntry => {
            this.doSendResponse(requestEntry, {
                service: this.serviceId,
                type: DecodedTileMessageName.Response,
                messageId: requestEntry.messageId,
                error: "cancelled" as any
            });
        });
    }
}
