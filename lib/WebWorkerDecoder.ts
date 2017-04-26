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
