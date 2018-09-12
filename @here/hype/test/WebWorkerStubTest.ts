/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
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

import { assert } from "chai";

const workerScript = `
    setTimeout( () => {
        const msg = 200;
        self.postMessage(msg);
    }, 200);
`;

const workerDefined = typeof Worker !== "undefined" && typeof Blob !== "undefined";
const describeWithWorker = workerDefined ? describe : xdescribe;

describeWithWorker("WebWorker without external network call ", () => {
    it("#fetchCatalog simulated", done => {
        // Arrange / Act
        assert.isDefined(Blob);
        const blob = new Blob([workerScript], { type: "application/javascript" });
        assert.isTrue(blob.size > 0);

        const worker = new Worker(URL.createObjectURL(blob));
        worker.addEventListener("message", msg => {
            if (msg.data === 200) {
                done();
            } else {
                done(new Error(JSON.stringify(msg.data)));
            }
        });
    });
});
