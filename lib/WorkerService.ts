/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s).
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

import {
    DecodedTileMessageName,
    InitializedMessage,
    isConfigurationMessage,
    isRequestMessage,
    RequestMessage,
    ResponseMessage
} from "@here/datasource-protocol";

import { LoggerManager } from "@here/utils";

const logger = LoggerManager.instance.create('WorkerService');

declare let self: Worker;

export interface WorkerServiceResponse {
    response: any;
    transferList?: ArrayBuffer[];
}

interface RequestEntry {
    service: string;
    messageId: number;
    responseSent: boolean;
}

/**
 * Worker Service communication helper.
 *
 * Listens to Web Worker messages from [[ConcurrentWorkerSet]] and implements
 *  - worker service initialization
 *  - request/respone scheme
 *  - error handling
 *
 * This class should be subclassed to provide concrete like [[TileDecoderService]].
 *
 * Communication Peer for [[ConcurrentWorkerSet]].
 */
export abstract class WorkerService {
    private pendingRequests: Map<number, RequestEntry> = new Map();

    constructor(readonly serviceId: string) {

        self.addEventListener("message", this.onMessage);

        const isInitializedMessage: InitializedMessage = {
            service: serviceId,
            type: DecodedTileMessageName.Initialized,
        }
        self.postMessage(isInitializedMessage);
    }

    destroy() {
        this.cancelAllPendingRequests();

        self.removeEventListener("message", this.onMessage);
    }

    /**
     * Message handler to be overriden by implementation.
     *
     * @param message `MessageEvent.data` as received by Service
     */
    protected handleMessage(message: any): void {
        logger.error(`[${this.serviceId}]: Invalid message ${message.type}`);
    }

    /**
     * Call Request handler to be overriden by implementation.
     *
     * @param request [[RequestMessage.request]] as received by Service
     */
    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        throw new Error(`ServiceAdapter[${this.serviceId}]: Invalid request '${request.type}'`);
    }

    /**
     * Central message handler for this service.
     *
     * Responsible for filtering message target and managing request/response sequence.
     *
     * @param message message to be dispatched
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
                }
                this.pendingRequests.set(request.messageId, requestEntry);
                this.tryHandleRequest(request.request)
                    .then((response) => {
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
                    .catch((error) => {
                        this.doSendResponse(requestEntry, {
                            service: this.serviceId,
                            type: DecodedTileMessageName.Response,
                            messageId: request.messageId,
                            error: error.toString()
                        })
                    });
            } else if (isConfigurationMessage(message.data)) {
                this.tryHandleMessage(message.data)
            }
        } catch (err) {
            logger.error(`[${this.serviceId}]: Unhandled exception when handling ${message.type}`);
        }
    }

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
        this.pendingRequests.delete(requestEntry.messageId);
    }

    private cancelAllPendingRequests() {
        this.pendingRequests.forEach((requestEntry) => {
            this.doSendResponse(requestEntry, {
                service: this.serviceId,
                type: DecodedTileMessageName.Response,
                messageId: requestEntry.messageId,
                error: "cancelled" as any
            })
        })
    }
}
