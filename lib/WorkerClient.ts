/** @module @here/mapview-decoder **//** */

declare let self: Worker;

export interface WorkerResponse {
    response: any;
    buffers?: any[];
}

export abstract class WorkerClient {
    constructor(public readonly id: string) {
         self.addEventListener("message", message => {
            if (typeof message.data.type !== "string" || message.data.type !== id)
                return;
            const workerResponse = this.handleEvent(message);
            self.postMessage(workerResponse.response, workerResponse.buffers);
        });
    }

    abstract handleEvent(message: MessageEvent): WorkerResponse;
}
