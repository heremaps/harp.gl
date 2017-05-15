/** @module @here/mapview-decoder **//** */

import { Decoder } from '../Decoder';
import { InitializeWorkerRequest } from './WorkerPoolRequests';

declare function require(param: any): any;

export class AmdWebWorkerDecoder extends Decoder {
    public readonly workers = new Array<Worker>();
    private readonly pendingRegistrations = new Map<string, { resolve: any, reject: any, count: number, error?: any }>();

    constructor(workerCount: number) {
        super();

        const AmdWorker = require("worker-loader?inline&fallback=false!./decoder-main");
        for (let i = 0; i < workerCount; ++i) {
            const worker = new AmdWorker() as Worker;
            worker.addEventListener("message", (event: any) => {
                if (event.data.type === "initialize")
                    this.onWorkerFunctionRegistered(event.data);
                else
                    this.eventHandler(event);
            });
            this.workers.push(worker);
        }
    }

    public postMessage(message: object, buffers?: ArrayBuffer[] | undefined) {
        const index = Math.floor(Math.random() * this.workers.length);
        this.workers[index].postMessage(message, buffers);
    }

    /**
     * Loads an AMD module in all web workers. Returns a promise that resolves
     * when all the loaders are ready, otherwise throws if an error occured.
     *
     * @param moduleName the name of an AMD module to load.
     * @param config optional additional configuration to pass to requirejs.config
     */
    loadModule(moduleName: string, config?: object): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.pendingRegistrations.set(moduleName, { resolve, reject, count: 0 });
            for (let worker of this.workers)
                worker.postMessage(new InitializeWorkerRequest(moduleName, config));
        });
    }

    private onWorkerFunctionRegistered(event: any) {
        const pendingRegistration = this.pendingRegistrations.get(event.id);
        if (pendingRegistration === undefined) {
            console.log("Got registration confirmation for unknown id", event.id);
            return;
        }

        if (event.error !== undefined) {
            pendingRegistration.error = event.error;
        }

        if (++pendingRegistration.count === this.workers.length) {
            if (pendingRegistration.error !== undefined)
                pendingRegistration.reject(pendingRegistration.error);
            else
                pendingRegistration.resolve();
            this.pendingRegistrations.delete(event.id);
        }
    }
}
