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

const url =
    "https://hype-ci-map.catalogs.datastore.sit.api.here.com" +
    "/v2/catalog/versions/latest" +
    "?startVersion=-1" +
    "&app_id=inxaFrAWuwRedan8stuc" +
    "&app_code=duf7nLX8P4G5cKeOLlmKSg";

const script = `
    fetch("${url}").then(result => {
        self.postMessage(result.status);
    }).catch(err => {
        self.postMessage(-1);
    });
`;

const workerDefined = typeof Worker !== "undefined" && typeof Blob !== "undefined";
const describeWithWorker = workerDefined ? describe : xdescribe;

describeWithWorker("[Integration tests] WebWorker, external network call test", function() {
    this.timeout(10000);

    it("fetchCatalog", done => {
        assert.isDefined(Blob);

        const blob = new Blob([script], { type: "application/javascript" });
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
