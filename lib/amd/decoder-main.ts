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

    if (request.config !== undefined)
        self.requirejs.config(request.config);

    self.requirejs([request.moduleName],
        () => { self.postMessage({ type: 'initialize', id: request.moduleName }); },
        (err: any) => {
            console.log("requirejs failed:", err.originalError);
            self.postMessage({ type: 'initialize', id: request.moduleName, error: err.toString() });
        });
});
