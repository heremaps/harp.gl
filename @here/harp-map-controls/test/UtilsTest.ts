/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { safeParseDecimalInt } from "../lib/Utils";

describe("MapControls", function () {
    describe("Utils", function () {
        it("safeParseDecimalInt", function () {
            assert.equal(safeParseDecimalInt("0", 1), 0);
            assert.equal(safeParseDecimalInt("123456789", 666), 123456789);

            assert.equal(safeParseDecimalInt("100%", 555), 555);
            assert.equal(safeParseDecimalInt("0xff", 777), 777);
            assert.equal(safeParseDecimalInt("767xx", 666), 666);
        });
    });
});
