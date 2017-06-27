/*
 * Copyright (C) 2017 HERE Global B.V. and its affiliate(s).
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

/** @module @here/mapview-decoder **//** */

import { Decoder } from './Decoder';

export class WebWorkerDecoder extends Decoder {
    public readonly workers = new Array<Worker>();

    constructor(workerCount: number, script: string) {
        super();

        for (let i = 0; i < workerCount; ++i) {
            const worker = new Worker(script);
            worker.addEventListener("message", (event) => this.eventHandler(event));
            this.workers.push(worker);
        }
    }

    public postMessage(message: object, buffers?: ArrayBuffer[] | undefined) {
        const index = Math.floor(Math.random() * this.workers.length);
        this.workers[index].postMessage(message, buffers);
    }
}
