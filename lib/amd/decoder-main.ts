/** @module @here/mapview-decoder **//** */

import { isInitializeWorkerRequest, InitializeWorkerRequest } from './WorkerPoolRequests';

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

self.addEventListener("message", (message: MessageEvent) => {
    const request : any | InitializeWorkerRequest = message.data;

    if (!isInitializeWorkerRequest(request))
        return; // message not for us

    const modules = [ request.moduleName ].concat(request.additionalModules === undefined ? [] : request.additionalModules);
    self.requirejs(modules,
        () => { self.postMessage({ type: 'initialize', id: request.moduleName }); },
        (err: any) => {
            console.log("requirejs failed:", err.originalError);
            self.postMessage({ type: 'initialize', id: request.moduleName, error: err.toString() });
        });
});
