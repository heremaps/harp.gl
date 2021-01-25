/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { getOptionValue } from "../lib/OptionsUtils";

describe("OptionsUtils", function () {
    describe("#getOptionValue", function () {
        it("returns first defined", function () {
            assert.equal(getOptionValue(), undefined);
            assert.equal(getOptionValue(undefined), undefined);
            assert.equal(getOptionValue(1), 1);
            assert.equal(getOptionValue(undefined, 2, 3), 2);
            assert.equal(getOptionValue(undefined, 2), 2);
        });
        it("erases 'undefined' from type if last param is defined", function () {
            const r1: number = getOptionValue(undefined, 2);
            assert.equal(r1, 2);
            const r2: number = getOptionValue(undefined, undefined, 3);
            assert.equal(r2, 3);
            const r3: number = getOptionValue(undefined, undefined, undefined, 4);
            assert.equal(r3, 4);
        });
    });
});
