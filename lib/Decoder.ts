/** @module @here/mapview-decoder **//** */

import { InitializeWorkerRequest } from './WorkerPoolRequests';

//
// ### to enable AMD, uncomment the following and pass it to the constructor of Decoder
// declare function require(param: any): any;
// export const AmdWorker = require("worker-loader?inline&fallback=false!./decoder-main.ts");
//

export class Decoder {

    public readonly workers = new Array<Worker>();
    private readonly eventListeners = new Map<string, (message: any) => void>();
    private readonly pendingRegistrations = new Map<string, { resolve: any, reject: any, count: number, error?: any }>();

    /**
     * Creates a new Decoder
     *
     * @param workerCount the amount of Web Workers to create
     */
    constructor(workerCount: number, decoderCreator: () => Worker) {
        workerCount = Math.max(workerCount, 1);

        for (let i = 0; i < workerCount; ++i) {

            const worker = decoderCreator();
            this.workers.push(worker);
            worker.addEventListener("message", (event: any) => {
                if (typeof event.data.type !== "string")
                    throw new Error("cannot dispatch event " + JSON.stringify(event.data));

                if (event.data.type === "initialize") {
                    this.onWorkerFunctionRegistered(event.data);
                } else {
                    this.dispatchEvent(event.data.type, event);
                }
            });
        }
    }

    /**
     * Registers an event listener for events that originated in a
     * web worker for a given id. Only one event listener can be set
     * per id.
     *
     * @param id the id to listen to
     * @param callback the callback to invoke for matching events
     */
    public addEventListener(id: string, callback: (message: any) => void) {
        this.eventListeners.set(id, callback);
    }

    /**
     * Removes a previously set event listener for the given id.
     *
     * @param id the id for which to remove the event listeners
     */
    public removeEventListener(id: string) {
        this.eventListeners.delete(id);
    }

    private dispatchEvent(id: string, message: any) {
        const callback = this.eventListeners.get(id);
        if (callback === undefined)
            throw new Error("cannot dispatch event " + JSON.stringify(message));
        callback(message);
    }

    /**
     * Posts a message to a random worker.
     *
     * @param message the message to send
     * @param buffers optional buffers to transfer to the worker
     */
    public postMessage(message: object, buffers?: ArrayBuffer[]): void | never {
        const index = Math.floor(Math.random() * this.workers.length);
        this.workers[index].postMessage(message, buffers);
    }

    /**
     * Initializes the worker with a function from an AMD module on a given id.
     * This function will receive all messages whose type are of the given type.
     *
     * @param type the message.type to listen to
     * @param moduleName the name of an AMD module to load. Must be fully qualified
     * @param decoderFunction the name of a function in the given module
     * @param additionalModules a list of additional module names to require
     */
    registerWorkerFunction(type: string, moduleName: string, decoderFunction: string, additionalModules?: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.pendingRegistrations.set(type, { resolve, reject, count: 0 });
            for (let worker of this.workers)
                worker.postMessage(new InitializeWorkerRequest(type, moduleName, decoderFunction, additionalModules));
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
