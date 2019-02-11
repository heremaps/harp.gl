/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedTileMessageName,
    WORKER_SERVICE_MANAGER_SERVICE_ID,
    WorkerServiceManagerMessage
} from "@here/harp-datasource-protocol";
import { LoggerManager } from "@here/harp-utils";
import { WorkerService } from "./WorkerService";

const logger = LoggerManager.instance.create("WorkerServiceManager");

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
            this.m_service = new WorkerServiceManager(WORKER_SERVICE_MANAGER_SERVICE_ID);
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
    private m_factories = new Map<string, WorkerServiceFactory>();

    /**
     * Contains all managed worker services indexed by their `serviceId`.
     */
    private m_services = new Map<string, WorkerService>();

    private constructor(serviceId: string = WORKER_SERVICE_MANAGER_SERVICE_ID) {
        super(serviceId);
    }

    /**
     * Register [[WorkerService]] class to this manager.
     *
     * @param workerServiceDescriptor service type and factory
     */
    register(workerServiceDescriptor: WorkerServiceDescriptor): void {
        this.m_factories.set(workerServiceDescriptor.serviceType, workerServiceDescriptor.factory);
    }

    protected handleMessage(message: WorkerServiceManagerMessage): void {
        if (message.type === DecodedTileMessageName.CreateService) {
            const existingService = this.m_services.get(message.targetServiceId);
            if (existingService !== undefined) {
                logger.error(
                    `error - service with targetServiceId='${
                        message.targetServiceId
                    }' already running, ignoring CreateService request`
                );
                return;
            }

            const factory = this.m_factories.get(message.targetServiceType);

            if (factory === undefined) {
                logger.error(`unknown targetServiceType requested: '${message.targetServiceType}'`);
                return;
            }

            const service = factory(message.targetServiceId);
            this.m_services.set(message.targetServiceId, service);
        }
        if (message.type === DecodedTileMessageName.DestroyService) {
            const service = this.m_services.get(message.targetServiceId);
            if (service === undefined) {
                logger.error(`unknown targetServiceId '${message.targetServiceId}'`);
                return;
            }
            service.destroy();
            this.m_services.delete(message.targetServiceId);
        }
    }
}
