/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { isWorkerBootstrapResponse } from "@here/harp-mapview/lib/workers/WorkerBootstrapDefs";

declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
};

/**
 * Async bootstrap using "worker bootstrap protocol" defined in [[WorkerBootstrapDefs]] and
 * supported by `WorkerLoader`
 *
 * Resolves, when all the dependencies are loaded.
 * Rejects after timeout (1000ms) and in case error while loading dependencies.
 */
function asyncWorkerBootstrap(dependencies: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        self.postMessage({
            type: "worker-bootstrap-request",
            dependencies
        });

        let timeoutHit = false;
        const warnTimeout = setTimeout(() => {
            timeoutHit = true;
            reject(
                new Error("#asyncWorkerBootstrap: Timeout waiting for `worker-bootstrap-response`.")
            );
        }, 1000);

        function bootstrapEventHandler(event: MessageEvent) {
            if (timeoutHit) {
                return;
            }
            try {
                const message = event.data;
                if (isWorkerBootstrapResponse(message)) {
                    clearTimeout(warnTimeout);

                    self.removeEventListener("message", bootstrapEventHandler);

                    const resolvedDependencies = message.resolvedDependencies;
                    for (const initScript of resolvedDependencies) {
                        self.importScripts(initScript);
                    }

                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        }

        self.addEventListener("message", bootstrapEventHandler);
    });
}

if ((self as any).THREE) {
    import("./DecoderBundleMain");
} else {
    asyncWorkerBootstrap(["three"])
        .then(() => {
            import("./DecoderBundleMain");
        })
        .catch(error => {
            // eslint-disable-next-line no-console
            console.error(`harp-decoders.js: failed to bootstrap: ${error}`, error);
        });
}
