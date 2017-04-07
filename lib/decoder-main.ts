import { isInitializeWorkerRequest } from './WorkerPoolRequests';

declare let self: Worker & {
    importScripts(..._scripts: string[]): void;
    requirejs: any;
    define: any;
};

declare function require(param: any): any;

(function initializeRequireJs() {
    const exports = require("exports-loader?requirejs,define!requirejs/require.js");
    self.requirejs = exports.requirejs;
    self.define = exports.define;
})();

const decoderFunctions = new Map<string, (event: MessageEvent) => void>();

self.addEventListener("message", message => {
    if (typeof message.data.type !== "string") {
        console.log("cannot decode message " + JSON.stringify(message.data));
        return;
    }

    if (isInitializeWorkerRequest(message.data)) {
        const modules = [ message.data.moduleName ].concat(message.data.additionalModules === undefined ? [] : message.data.additionalModules);
        self.requirejs(modules,
            (module: any) => {
                decoderFunctions.set(message.data.id, function(event: MessageEvent) { module[message.data.decoderFunction](event); });
                self.postMessage({ type: 'initialize', id: message.data.id });
            },
            (err: any) => {
                self.postMessage({ type: 'initialize', id: message.data.id, error: err });
                console.log("requirejs failed:", err)
            });
        return;
    }

    const decoderFunction = decoderFunctions.get(message.data.type);
    if (decoderFunction === undefined)
        return console.log("Worker received unknown message:", message);
    decoderFunction(message);
});
