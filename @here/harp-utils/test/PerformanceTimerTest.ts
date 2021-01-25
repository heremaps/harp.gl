/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { PerformanceTimer } from "../lib/PerformanceTimer";

describe("PerformanceTimer", function () {
    it("#now", async function () {
        const t0 = PerformanceTimer.now();
        let t1 = 0;
        assert.isNumber(t0);
        assert.isAbove(t0, 0);

        await new Promise<any>((resolve, reject) => {
            function test() {
                t1 = PerformanceTimer.now();
                assert.isNumber(t1);
                assert.isAbove(t1, t0);
            }

            function iteration() {
                try {
                    const r = test();
                    resolve(r);
                } catch (error) {
                    if (error.constructor.name === "AssertionError") {
                        setTimeout(iteration, 1);
                    } else {
                        reject(error);
                    }
                }
            }
            setTimeout(iteration, 1);
        });
    });
});
