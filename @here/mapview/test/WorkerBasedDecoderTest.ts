/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as sinon from "sinon";

import { ConcurrentWorkerSet } from "../lib/ConcurrentWorkerSet";
import { WorkerBasedDecoder } from "../lib/WorkerBasedDecoder";

describe("WorkerBasedDecoder", () => {
    it("#dispose releases associates workerSet", () => {
        const workerSetStub = sinon.createStubInstance<ConcurrentWorkerSet>(ConcurrentWorkerSet);

        const target = new WorkerBasedDecoder((workerSetStub as any) as ConcurrentWorkerSet, "foo");

        assert.equal(workerSetStub.addReference.callCount, 1);
        assert.equal(workerSetStub.removeReference.callCount, 0);

        target.dispose();

        assert.equal(workerSetStub.addReference.callCount, 1);
        assert.equal(workerSetStub.removeReference.callCount, 1);
    });
});
