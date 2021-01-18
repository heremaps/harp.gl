/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Common communication protocol for [[WorkerService]].
 */
export namespace WorkerServiceProtocol {
    /**
     * Service id of worker manager ([[WorkerServiceManager]]) used to create/destroy service
     * instances in workers.
     */
    export const WORKER_SERVICE_MANAGER_SERVICE_ID = "worker-service-manager";

    /**
     * Define possible names of messages exchanged with services within `WebWorker`.
     */
    export enum ServiceMessageName {
        Initialized = "initialized",
        Request = "request",
        Response = "response"
    }

    /**
     * Interface for `ServiceMessage` which describes metadata for a service messages.
     */
    export interface ServiceMessage {
        service: string;
        type: ServiceMessageName;
    }

    /**
     * This message is sent by the worker to the main thread. No data is sent. Receiving this
     * message confirms that the worker has started successfully.
     */
    export interface InitializedMessage extends ServiceMessage {
        type: ServiceMessageName.Initialized;
    }

    /**
     * Type guard to check if an object is a signal message from worker.
     */
    export function isInitializedMessage(message: any): message is InitializedMessage {
        return (
            message &&
            typeof message.service === "string" &&
            typeof message.type === "string" &&
            message.type === ServiceMessageName.Initialized
        );
    }

    /**
     * Define possible names of requests called on services within `WebWorker`.
     */
    export enum Requests {
        CreateService = "create-service",
        DestroyService = "destroy-service"
    }

    /**
     * This is an internal general interface used in communication with workers.
     * Check [[ConcurrentWorkerSet]]'s invokeRequest function for exemplary usage.
     */
    export interface ServiceRequest {
        type: string;
    }

    /**
     * This message is sent by the main thread to [[WorkerServiceManager]] to dynamically create a
     * new service.
     *
     * May throw `UnknownServiceError` if service of given type is not registered in
     * [[WorkerServiceManager]], see [[isUnknownServiceError]].
     */
    export interface CreateServiceRequest extends ServiceRequest {
        type: Requests.CreateService;

        /**
         * Type of service to be created.
         *
         * @see [[WorkerServiceManager.register]]
         */
        targetServiceType: string;

        /**
         * The newly created service instance will be available under this id.
         */
        targetServiceId: string;
    }

    /**
     * Test if `error` thrown by [[CreateServiceRequest]] was caused by unknown type of service.
     */
    export function isUnknownServiceError(error: Error): boolean {
        return error.message.includes("unknown targetServiceType requested: ");
    }

    /**
     * This message is sent by the main thread to [[WorkerServiceManager]] to dynamically destroy a
     * service.
     */
    export interface DestroyServiceRequest extends ServiceRequest {
        type: Requests.DestroyService;

        /**
         * Id of service to be destroyed.
         */
        targetServiceId: string;
    }

    /**
     * Possible service management messages (`CreateService` or `DestroyService`) sent to WebWorker.
     */
    export type WorkerServiceManagerRequest = CreateServiceRequest | DestroyServiceRequest;

    /**
     * This message is a part of the Request-Response scheme implemented to be used in communication
     * between workers and the decoder.
     */
    export interface RequestMessage extends ServiceMessage {
        type: ServiceMessageName.Request;
        messageId: number;
        request: any;
    }

    /**
     * Type guard to check if an object is a request message sent to a worker.
     */
    export function isRequestMessage(message: any): message is RequestMessage {
        return (
            message &&
            typeof message.service === "string" &&
            typeof message.type === "string" &&
            message.type === ServiceMessageName.Request
        );
    }

    /**
     * This message is a part of the Request-Response scheme implemented to be used in communication
     * between workers and the decoder.
     */
    export interface ResponseMessage extends ServiceMessage {
        type: ServiceMessageName.Response;
        messageId: number;
        errorMessage?: string;
        errorStack?: string;
        response?: object;
    }

    /**
     * Type guard to check if an object is a request message sent to a worker.
     */
    export function isResponseMessage(message: any): message is ResponseMessage {
        return (
            message &&
            typeof message.service === "string" &&
            typeof message.type === "string" &&
            message.type === ServiceMessageName.Response
        );
    }
}
