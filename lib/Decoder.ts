import { InitializeWorkerRequest } from './WorkerPoolRequests';

declare function require(param: any): any;

export class Decoder {

    public readonly workers = new Array<Worker>();
    private readonly eventListeners = new Map<string, (message: any) => void>();

    constructor(workerCount: number) {
        workerCount = Math.max(workerCount, 1);

        const DecoderWorker = require("worker-loader?inline&fallback=false!./decoder-main.ts");

        for (let i = 0; i < workerCount; ++i) {

            const worker = new DecoderWorker() as Worker;
            this.workers.push(worker);
            worker.addEventListener("message", event => {
                if (typeof event.data.type === "string")
                    this.dispatchEvent(event.data.type, event);
                else
                    throw new Error("cannot dispatch event " + JSON.stringify(event.data));
            });
        }
    }

    public addEventListener(id: string, callback: (message: any) => void) {
        this.eventListeners.set(id, callback);
    }

    public removeEventListener(id: string) {
        this.eventListeners.delete(id);
    }

    public dispatchEvent(id: string, message: any) {
        const callback = this.eventListeners.get(id);
        if (callback === undefined)
            throw new Error("cannot dispatch event " + JSON.stringify(message));
        callback(message);
    }

    postMessage(message: object, buffers?: ArrayBuffer[]): void | never {
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
    registerWorkerFunction(type: string, moduleName: string, decoderFunction: string, additionalModules?: string[]) {
        for (let worker of this.workers)
            worker.postMessage(new InitializeWorkerRequest(type, moduleName, decoderFunction, additionalModules));
    }
}
