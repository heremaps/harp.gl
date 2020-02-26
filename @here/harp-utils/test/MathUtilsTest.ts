/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
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
        it("roundFraction", () => {
            assert.equal(MathUtils.roundFraction(1, 0), 1);
            assert.equal(MathUtils.roundFraction(5, 0), 5);
            assert.equal(MathUtils.roundFraction(99, 0), 99);

            assert.equal(MathUtils.roundFraction(1.1, 0), 1);
            assert.equal(MathUtils.roundFraction(1.4, 0), 1);
            assert.equal(MathUtils.roundFraction(1.4999999999, 0), 1);
            assert.equal(MathUtils.roundFraction(1.5, 0), 2);

            assert.equal(MathUtils.roundFraction(5.1, 0), 5);
            assert.equal(MathUtils.roundFraction(5.4, 0), 5);
            assert.equal(MathUtils.roundFraction(5.4999999999, 0), 5);
            assert.equal(MathUtils.roundFraction(5.5, 0), 6);
            assert.equal(MathUtils.roundFraction(5.9999999999, 0), 6);

            assert.equal(MathUtils.roundFraction(99.1, 0), 99);
            assert.equal(MathUtils.roundFraction(99.4, 0), 99);
            assert.equal(MathUtils.roundFraction(99.499999999, 0), 99);
            assert.equal(MathUtils.roundFraction(99.5, 0), 100);
            assert.equal(MathUtils.roundFraction(99.999999999, 0), 100);

            assert.equal(MathUtils.roundFraction(1.1, 1), 1.1);
            assert.equal(MathUtils.roundFraction(1.11, 1), 1.1);
            assert.equal(MathUtils.roundFraction(1.1000000001, 1), 1.1);
            assert.equal(MathUtils.roundFraction(1.14, 1), 1.1);
            assert.equal(MathUtils.roundFraction(1.1499999999, 1), 1.1);

            assert.equal(MathUtils.roundFraction(1.15, 1), 1.2);
            assert.equal(MathUtils.roundFraction(1.19, 1), 1.2);
            assert.equal(MathUtils.roundFraction(1.1999999999, 1), 1.2);

            assert.equal(MathUtils.roundFraction(1.1, 2), 1.1);
            assert.equal(MathUtils.roundFraction(1.101, 2), 1.1);
            assert.equal(MathUtils.roundFraction(1.1049999999, 2), 1.1);
            assert.equal(MathUtils.roundFraction(1.105, 2), 1.11);

            assert.equal(MathUtils.roundFraction(1.15, 2), 1.15);
            assert.equal(MathUtils.roundFraction(1.15, 10), 1.15);
            assert.equal(MathUtils.roundFraction(1.15000000001, 10), 1.15);
            assert.equal(MathUtils.roundFraction(1.15000000001, 11), 1.15000000001);

            assert.equal(MathUtils.roundFraction(99.001, 2), 99);
            assert.equal(MathUtils.roundFraction(99.005, 2), 99.01);
            assert.equal(MathUtils.roundFraction(99.0005, 2), 99);
            assert.equal(MathUtils.roundFraction(99.499999, 2), 99.5);
            assert.equal(MathUtils.roundFraction(99.495, 2), 99.5);
            assert.equal(MathUtils.roundFraction(99.999999, 2), 100);

            // Test negative numbers
            assert.equal(MathUtils.roundFraction(-0.1, 0), 0);
            assert.equal(MathUtils.roundFraction(-0.5, 0), -1);
            assert.equal(MathUtils.roundFraction(-0.9, 0), -1);

            assert.equal(MathUtils.roundFraction(-1.1, 0), -1);
            assert.equal(MathUtils.roundFraction(-1.4, 0), -1);
            assert.equal(MathUtils.roundFraction(-1.4999999999, 0), -1);
            assert.equal(MathUtils.roundFraction(-1.5, 0), -2);
            assert.equal(MathUtils.roundFraction(-9.5, 0), -10);

            assert.equal(MathUtils.roundFraction(-0.45, 1), -0.5);
            assert.equal(MathUtils.roundFraction(-0.45, 2), -0.45);
            assert.equal(MathUtils.roundFraction(-0.55, 1), -0.6);
            assert.equal(MathUtils.roundFraction(-0.555, 2), -0.56);

            assert.equal(MathUtils.roundFraction(-1.4999999999, 1), -1.5);
            assert.equal(MathUtils.roundFraction(-1.4999999999, 2), -1.5);
            assert.equal(MathUtils.roundFraction(-1.495, 2), -1.5);

            assert.equal(MathUtils.roundFraction(-9.5, 1), -9.5);
            assert.equal(MathUtils.roundFraction(-9.555, 1), -9.6);
            assert.equal(MathUtils.roundFraction(-9.999, 1), -10);

            // Allows to pass digits number as float, should remove fraction part then.
            assert.equal(MathUtils.roundFraction(1.2345, 1.5), 1.2);
            assert.equal(MathUtils.roundFraction(1.2345, 2.5), 1.23);
            assert.equal(MathUtils.roundFraction(1.2345, 3.9), 1.235);

            // Test wrong argument for digits num.
            assert.throws(() => {
                MathUtils.roundFraction(10.1, -1);
            }, "Number of digits must be higher then 0!");
            assert.throws(() => {
                MathUtils.roundFraction(10.12, -2.4);
            }, "Number of digits must be higher then 0!");
        });
    });
});
