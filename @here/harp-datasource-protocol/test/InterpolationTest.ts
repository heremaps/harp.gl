/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { MapEnv } from "../lib/Env";
import { Expr, JsonArray } from "../lib/Expr";
import { getPropertyValue } from "../lib/PropertyValue";

const makeNumberInterpolation = (mode: JsonArray) => {
    return Expr.fromJSON(["interpolate", mode, ["zoom"], 0, 0, 5, 100, 10, 500]);
};

const makeBooleanInterpolation = (mode: JsonArray) => {
    return Expr.fromJSON(["interpolate", mode, ["zoom"], 0, true, 5, false, 10, true]);
};

const makeColorInterpolation = (mode: JsonArray) => {
    return Expr.fromJSON([
        "interpolate",
        mode,
        ["zoom"],
        0,
        "rgb(255,0,0)",
        5,
        "rgb(0,255,0)",
        10,
        "rgb(0,0,255)"
    ]);
};

const makeEnumInterpolation = (mode: JsonArray) => {
    return Expr.fromJSON(["interpolate", mode, ["zoom"], 0, "Enum0", 5, "Enum1", 10, "Enum2"]);
};

function evaluateInterpolatedPropertyZoom(property: Expr, level: number) {
    return getPropertyValue(property, new MapEnv({ $zoom: level }));
}

describe("Interpolation", function () {
    it("Discrete", () => {
        const numberProperty = makeNumberInterpolation(["discrete"]);
        const booleanProperty = makeBooleanInterpolation(["discrete"]);
        const colorProperty = makeColorInterpolation(["discrete"]);
        const enumProperty = makeEnumInterpolation(["discrete"]);

        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, -Infinity), 0);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, 0), 0);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, 2.5), 0);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, 5), 100);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, 7.5), 100);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, 10), 500);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(numberProperty, Infinity), 500);

        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, -Infinity), true);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, 0), true);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, 2.5), true);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, 5), false);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, 7.5), false);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, 10), true);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(booleanProperty, Infinity), true);

        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, -Infinity), 0xff0000);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, 0), 0xff0000);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, 2.5), 0xff0000);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, 5), 0x00ff00);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, 7.5), 0x00ff00);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, 10), 0x0000ff);
        assert.strictEqual(evaluateInterpolatedPropertyZoom(colorProperty, Infinity), 0x0000ff);

        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, -Infinity), "Enum0");
        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, 0), "Enum0");
        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, 2.5), "Enum0");
        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, 5), "Enum1");
        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, 7.5), "Enum1");
        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, 10), "Enum2");
        assert.strictEqual(evaluateInterpolatedPropertyZoom(enumProperty, Infinity), "Enum2");
    });
    it("Linear", () => {
        const numberProperty = makeNumberInterpolation(["linear"]);
        const colorProperty = makeColorInterpolation(["linear"]);

        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, -Infinity), 0);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 0), 0);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 2.5), 50);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 5), 100);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 7.5), 300);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 10), 500);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, Infinity), 500);

        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, -Infinity), 0xff0000);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 0), 0xff0000);
        // rgb: [ 0.5, 0.5, 0 ]
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 2.5), 0x7f7f00);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 5), 0x00ff00);
        // rgb: [ 0, 0.5, 0.5 ]
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 7.5), 0x007f7f);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 10), 0x0000ff);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, Infinity), 0x0000ff);
    });
    it("Cubic", () => {
        const numberProperty = makeNumberInterpolation(["cubic"]);
        const colorProperty = makeColorInterpolation(["cubic"]);

        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, -Infinity), 0);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 0), 0);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 2.5), 31.25);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 5), 100);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 7.5), 281.25);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 10), 500);
        assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, Infinity), 500);

        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, -Infinity), 0xff0000);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 0), 0xff0000);
        // rgb: [ 0.4375, 0.625, 0 ]
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 2.5), 0x6f9f00);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 5), 0x00ff00);
        // rgb: [ 0, 0.625, 0.4375 ]
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 7.5), 0x009f6f);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 10), 0x0000ff);
        assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, Infinity), 0x0000ff);
    });
    describe("Exponential", () => {
        it("Exponential interpolation with `base=1` is the same as linear interpolation", () => {
            const numberProperty = makeNumberInterpolation(["exponential", 1]);
            const colorProperty = makeColorInterpolation(["exponential", 1]);

            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, -Infinity), 0);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 0), 0);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 2.5), 50);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 5), 100);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 7.5), 300);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 10), 500);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, Infinity), 500);

            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, -Infinity), 0xff0000);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 0), 0xff0000);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 2.5), 0x7f7f00);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 5), 0x00ff00);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 7.5), 0x007f7f);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 10), 0x0000ff);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, Infinity), 0x0000ff);
        });

        it("Exponential interpolation with `base=2`", () => {
            const numberProperty = makeNumberInterpolation(["exponential", 2]);
            const colorProperty = makeColorInterpolation(["exponential", 2]);

            const eps = 1e-2;

            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, -Infinity), 0);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 0), 0);
            assert.approximately(
                evaluateInterpolatedPropertyZoom(numberProperty, 2.5),
                15.022,
                eps
            );
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 5), 100);
            assert.approximately(
                evaluateInterpolatedPropertyZoom(numberProperty, 7.5),
                160.088,
                eps
            );
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, 10), 500);
            assert.equal(evaluateInterpolatedPropertyZoom(numberProperty, Infinity), 500);

            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, -Infinity), 0xff0000);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 0), 0xff0000);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 2.5), 0xd82600);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 5), 0x00ff00);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 7.5), 0x00d826);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, 10), 0x0000ff);
            assert.equal(evaluateInterpolatedPropertyZoom(colorProperty, Infinity), 0x0000ff);
        });
    });
});
