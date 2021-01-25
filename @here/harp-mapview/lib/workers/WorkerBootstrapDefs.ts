/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message sent by web worker that requests to resolve actual
 * URLs of it's dependencies.
 *
 * Main thread is expected.
 */
export interface WorkerBootstrapRequest {
    type: "worker-bootstrap-request";

    /// Names of dependencies, usually NPM package names.
    dependencies: string[];
}

export interface WorkerBootstrapResponse {
    type: "worker-bootstrap-response";

    /// Actual URL scripts requested in [[WorkerBootstrapRequest]].
    resolvedDependencies: string[];
}

export function isWorkerBootstrapRequest(message: any): message is WorkerBootstrapRequest {
    return (
        message &&
        message.type === "worker-bootstrap-request" &&
        Array.isArray(message.dependencies)
    );
}

export function isWorkerBootstrapResponse(message: any): message is WorkerBootstrapResponse {
    return (
        message &&
        message.type === "worker-bootstrap-response" &&
        Array.isArray(message.resolvedDependencies)
    );
}
