/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ITileDecoder } from "@here/harp-datasource-protocol";
import { ConcurrentWorkerSet } from "./ConcurrentWorkerSet";
import { WorkerBasedDecoder } from "./WorkerBasedDecoder";

/**
 * Default concurrent decoder helper.
 *
 * A convenient singleton that maintains a separate [[ConcurrentWorkerSet]] for each bundle
 * requested. Provides easy access to [[WorkerBasedDecoder]]s for data sources.
 */
export class ConcurrentDecoderFacade {
    /**
     * The URL containing a script to fall back (default) to when looking for worker sets
     * and decoders.
     */
    static defaultScriptUrl: string = "./decoder.bundle.js";

    /**
     * The default number of workers.
     */
    static defaultWorkerCount?: number = undefined;

    /**
     * Returns a [[WorkerBasedDecoder]] instance.
     *
     * @param decoderServiceType The name of the decoder service type.
     * @param scriptUrl The optional URL with the workers' script.
     */
    static getTileDecoder(decoderServiceType: string, scriptUrl?: string): ITileDecoder {
        const workerSet = this.getWorkerSet(scriptUrl);

        return new WorkerBasedDecoder(workerSet, decoderServiceType);
    }

    /**
     * Returns a [[ConcurrentWorkerSet]] instance based on the script URL specified.
     *
     * @param scriptUrl The optional URL with the workers' script. If not specified,
     * the function uses [[defaultScriptUrl]] instead.
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
     * Destroys a [[ConcurrentWorkerSet]] instance.
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
     * Destroys all managed [[ConcurrentWorkerSet]]s.
     */
    static destroy() {
        Object.keys(this.workerSets).forEach(name => {
            this.workerSets[name].destroy();
        });
        this.workerSets = {};
    }

    /**
     * The [[ConcurrentWorkerSet]] instances which are stored by the script URL.
     */
    private static workerSets: {
        [bundleUrl: string]: ConcurrentWorkerSet;
    } = {};
}
