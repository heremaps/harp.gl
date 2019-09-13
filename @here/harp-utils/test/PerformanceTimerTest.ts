/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { willEventually } from "@here/harp-test-utils";
import { assert } from "chai";
import { PerformanceTimer } from "../lib/PerformanceTimer";

describe("PerformanceTimer", function() {
    it("#now", async function() {
        const t0 = PerformanceTimer.now();
        assert.isNumber(t0);
        assert.isAbove(t0, 0);

        await willEventually(() => {
            const t1 = PerformanceTimer.now();
            assert.isNumber(t1);
            assert.isAbove(t1, t0);
        });
    });
});
