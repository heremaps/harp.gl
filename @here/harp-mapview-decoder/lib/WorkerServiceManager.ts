/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkerServiceProtocol } from "@here/harp-datasource-protocol";

import { WorkerService, WorkerServiceResponse } from "./WorkerService";

/**
 * Factory function that creates [[WorkerService]].
 */
export type WorkerServiceFactory = (serviceId: string) => WorkerService;

/**
 * Worker service class definition as needed by [[WorkerServiceManager.register]].
 */
export interface WorkerServiceDescriptor {
    serviceType: string;
    factory: WorkerServiceFactory;
}

/**
 * Manages dynamic worker services in Web Worker context.
 *
 * Handles `CreateService` and `DestroyService` messages sent to Web Worker. Singleton (in scope of
 * one worker runtime!), starts automatically with first [[getInstance]] call.
 */
export class WorkerServiceManager extends WorkerService {
    /**
     * Gets the default instance of `WorkerServiceManager`. Starts the service when first called.
     */
    static getInstance() {
        if (this.m_service === undefined) {
            this.m_service = new WorkerServiceManager(
                WorkerServiceProtocol.WORKER_SERVICE_MANAGER_SERVICE_ID
            );
        }
        return this.m_service;
    }

    /**
     * Default instance of `WorkerServiceManager`.
     */
    private static m_service: WorkerServiceManager;

    /**
     * Contains all registered service factories indexed by `serviceType`.
     */
    private readonly m_factories = new Map<string, WorkerServiceFactory>();

    /**
     * Contains all managed worker services indexed by their `serviceId`.
     */
    private readonly m_services = new Map<string, WorkerService>();

    private constructor(
        serviceId: string = WorkerServiceProtocol.WORKER_SERVICE_MANAGER_SERVICE_ID
    ) {
        super(serviceId);
    }

    /**
     * Register [[WorkerService]] class to this manager.
     *
     * @param workerServiceDescriptor - service type and factory
     */
    register(workerServiceDescriptor: WorkerServiceDescriptor): void {
        this.m_factories.set(workerServiceDescriptor.serviceType, workerServiceDescriptor.factory);
    }

    /** @override */
    protected handleRequest(request: any): Promise<WorkerServiceResponse> {
        if (request.type === WorkerServiceProtocol.Requests.CreateService) {
            const existingService = this.m_services.get(request.targetServiceId);
            if (existingService !== undefined) {
                throw Error(
                    `error - service with targetServiceId='${request.targetServiceId}' already running, ignoring CreateService request`
                );
            }

            const factory = this.m_factories.get(request.targetServiceType);

            if (factory === undefined) {
                throw Error(`unknown targetServiceType requested: '${request.targetServiceType}'`);
            }

            const service = factory(request.targetServiceId);
            this.m_services.set(request.targetServiceId, service);
        }
        if (request.type === WorkerServiceProtocol.Requests.DestroyService) {
            const service = this.m_services.get(request.targetServiceId);
            if (service === undefined) {
                throw Error(`unknown targetServiceId '${request.targetServiceId}'`);
            }
            service.destroy();
            this.m_services.delete(request.targetServiceId);
        }

        return Promise.resolve({
            response: {}
        });
    }
}
