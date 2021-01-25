/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { ConcurrentWorkerSet } from "../lib/ConcurrentWorkerSet";
import { WorkerBasedDecoder } from "../lib/WorkerBasedDecoder";

describe("WorkerBasedDecoder", function () {
    it("#dispose releases associates workerSet", function () {
        const workerSetStub = sinon.createStubInstance<ConcurrentWorkerSet>(ConcurrentWorkerSet);

        const target = new WorkerBasedDecoder((workerSetStub as any) as ConcurrentWorkerSet, "foo");

        assert.equal(workerSetStub.addReference.callCount, 1);
        assert.equal(workerSetStub.removeReference.callCount, 0);

        target.dispose();

        assert.equal(workerSetStub.addReference.callCount, 1);
        assert.equal(workerSetStub.removeReference.callCount, 1);
    });
});
