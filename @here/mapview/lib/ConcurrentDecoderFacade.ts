/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { ITileDecoder } from "@here/datasource-protocol";
import { ConcurrentWorkerSet } from "./ConcurrentWorkerSet";
import { WorkerBasedDecoder } from "./WorkerBasedDecoder";

/**
 * Default concurrent decoder helper.
 *
 * Convenient singleton that maintains separate [[ConcurrentWorkerSet]] for each requested bundle.
 * Easy access to [[WorkerBasedDecoder]]s for data sources.
 */
export class ConcurrentDecoderFacade {
    /**
     * The default script URL to fall back to when looking for worker sets and decoders.
     */
    static defaultScriptUrl: string = "./decoder.bundle.js";

    /**
     * The default number of workers.
     */
    static defaultWorkerCount?: number = undefined;

    /**
     * Returns a [[WorkerBasedDecoder]] instance.
     *
     * @param workerId The name of the decoder service as registered by the web workers.
     * @param scriptUrl The optional URL with the workers' script.
     */
    static getTileDecoder(workerId: string, scriptUrl?: string): ITileDecoder {
        const workerSet = this.getWorkerSet(scriptUrl);

        return new WorkerBasedDecoder(workerSet, workerId);
    }

    /**
     * Returns a [[ConcurrentWorkerSet]] instance based on the provided script URL.
     *
     * @param scriptUrl The optional URL with the workers' script. Falls back to
     * [[defaultScriptUrl]].
     */
    static getWorkerSet(scriptUrl?: string): ConcurrentWorkerSet {
        if (scriptUrl === undefined) {
            scriptUrl = this.defaultScriptUrl;
        }

        let workerSet = this.workerSets[scriptUrl];
        if (workerSet === undefined) {
            workerSet = new ConcurrentWorkerSet({
                scriptUrl,
                workerCount: this.defaultWorkerCount
            });
            this.workerSets[scriptUrl] = workerSet;
        }
        return workerSet;
    }

    /**
     * Destroy a [[ConcurrentWorkerSet]] instance.
     *
     * @param scriptUrl The worker script URL that was used to create the [[ConcurrentWorkerSet]].
     */
    static destroyWorkerSet(scriptUrl: string) {
        const workerSet = this.workerSets[scriptUrl];
        if (workerSet !== undefined) {
            workerSet.destroy();
            delete this.workerSets[scriptUrl];
        }
    }

    /**
     * Destroy all managed [[ConcurrentWorkerSet]]s.
     */
    static destroy() {
        Object.keys(this.workerSets).forEach(name => {
            this.workerSets[name].destroy();
        });
        this.workerSets = {};
    }

    /**
     * The [[ConcurrentWorkerSet]] instances stored by script URL.
     */
    private static workerSets: {
        [bundleUrl: string]: ConcurrentWorkerSet;
    } = {};
}
