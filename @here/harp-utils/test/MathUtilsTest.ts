/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";

import { MathUtils } from "../lib/MathUtils";

describe("MathUtils", () => {
    describe("General math utils", () => {
        it("min2", () => {
            assert.equal(MathUtils.min2(undefined, undefined), undefined);
            assert.equal(MathUtils.min2(2, undefined), 2);
            assert.equal(MathUtils.min2(undefined, 3), 3);
            assert.equal(MathUtils.min2(3, 2), 2);
            assert.equal(MathUtils.min2(2, 3), 2);
        });
        it("max2", () => {
            assert.equal(MathUtils.max2(undefined, undefined), undefined);
            assert.equal(MathUtils.max2(2, undefined), 2);
            assert.equal(MathUtils.max2(undefined, 3), 3);
            assert.equal(MathUtils.max2(3, 2), 3);
            assert.equal(MathUtils.max2(2, 3), 3);
        });
        it("isClamped", () => {
            assert.isTrue(MathUtils.isClamped(5, undefined, undefined));
            assert.isTrue(MathUtils.isClamped(2, undefined, 3));
            assert.isTrue(MathUtils.isClamped(3, 3, undefined));
            assert.isTrue(MathUtils.isClamped(2, 2, 3));
            assert.isTrue(MathUtils.isClamped(3, 3, 3));

            assert.isFalse(MathUtils.isClamped(0, 1, 2));
            assert.isFalse(MathUtils.isClamped(3, 1, 2));
            assert.isFalse(MathUtils.isClamped(5, undefined, 2));
            assert.isFalse(MathUtils.isClamped(0, 1, undefined));
        });
    });
});
