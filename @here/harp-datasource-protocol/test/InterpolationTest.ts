/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { getPropertyValue } from "../lib/InterpolatedProperty";
import { InterpolatedProperty, InterpolationMode } from "../lib/InterpolatedPropertyDefs";
import { StringEncodedNumeralType } from "../lib/StringEncodedNumeral";

const levels = new Float32Array([0, 5, 10]);

const numberProperty: InterpolatedProperty = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    values: [0, 100, 500]
};

const booleanProperty: InterpolatedProperty = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    values: [true, false, true]
};

const colorProperty: InterpolatedProperty = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    // [r0, g0, b0, r1, g1, b1, ...]
    values: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    _stringEncodedNumeralType: StringEncodedNumeralType.Hex
};

const enumProperty: InterpolatedProperty = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    values: ["Enum0", "Enum1", "Enum2"]
};

describe("Interpolation", function() {
    it("Discrete", () => {
        assert.strictEqual(getPropertyValue(numberProperty, -Infinity), 0);
        assert.strictEqual(getPropertyValue(numberProperty, 0), 0);
        assert.strictEqual(getPropertyValue(numberProperty, 2.5), 0);
        assert.strictEqual(getPropertyValue(numberProperty, 5), 100);
        assert.strictEqual(getPropertyValue(numberProperty, 7.5), 100);
        assert.strictEqual(getPropertyValue(numberProperty, 10), 500);
        assert.strictEqual(getPropertyValue(numberProperty, Infinity), 500);

        assert.strictEqual(getPropertyValue(booleanProperty, -Infinity), true);
        assert.strictEqual(getPropertyValue(booleanProperty, 0), true);
        assert.strictEqual(getPropertyValue(booleanProperty, 2.5), true);
        assert.strictEqual(getPropertyValue(booleanProperty, 5), false);
        assert.strictEqual(getPropertyValue(booleanProperty, 7.5), false);
        assert.strictEqual(getPropertyValue(booleanProperty, 10), true);
        assert.strictEqual(getPropertyValue(booleanProperty, Infinity), true);

        assert.strictEqual(getPropertyValue(colorProperty, -Infinity), 0xff0000);
        assert.strictEqual(getPropertyValue(colorProperty, 0), 0xff0000);
        assert.strictEqual(getPropertyValue(colorProperty, 2.5), 0xff0000);
        assert.strictEqual(getPropertyValue(colorProperty, 5), 0x00ff00);
        assert.strictEqual(getPropertyValue(colorProperty, 7.5), 0x00ff00);
        assert.strictEqual(getPropertyValue(colorProperty, 10), 0x0000ff);
        assert.strictEqual(getPropertyValue(colorProperty, Infinity), 0x0000ff);

        assert.strictEqual(getPropertyValue(enumProperty, -Infinity), "Enum0");
        assert.strictEqual(getPropertyValue(enumProperty, 0), "Enum0");
        assert.strictEqual(getPropertyValue(enumProperty, 2.5), "Enum0");
        assert.strictEqual(getPropertyValue(enumProperty, 5), "Enum1");
        assert.strictEqual(getPropertyValue(enumProperty, 7.5), "Enum1");
        assert.strictEqual(getPropertyValue(enumProperty, 10), "Enum2");
        assert.strictEqual(getPropertyValue(enumProperty, Infinity), "Enum2");
    });
    it("Linear", () => {
        numberProperty.interpolationMode = InterpolationMode.Linear;
        colorProperty.interpolationMode = InterpolationMode.Linear;

        assert.equal(getPropertyValue(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValue(numberProperty, 0), 0);
        assert.equal(getPropertyValue(numberProperty, 2.5), 50);
        assert.equal(getPropertyValue(numberProperty, 5), 100);
        assert.equal(getPropertyValue(numberProperty, 7.5), 300);
        assert.equal(getPropertyValue(numberProperty, 10), 500);
        assert.equal(getPropertyValue(numberProperty, Infinity), 500);

        assert.equal(getPropertyValue(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValue(colorProperty, 0), 0xff0000);
        // rgb: [ 0.5, 0.5, 0 ]
        assert.equal(getPropertyValue(colorProperty, 2.5), 0x7f7f00);
        assert.equal(getPropertyValue(colorProperty, 5), 0x00ff00);
        // rgb: [ 0, 0.5, 0.5 ]
        assert.equal(getPropertyValue(colorProperty, 7.5), 0x007f7f);
        assert.equal(getPropertyValue(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValue(colorProperty, Infinity), 0x0000ff);
    });
    it("Cubic", () => {
        numberProperty.interpolationMode = InterpolationMode.Cubic;
        colorProperty.interpolationMode = InterpolationMode.Cubic;

        assert.equal(getPropertyValue(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValue(numberProperty, 0), 0);
        assert.equal(getPropertyValue(numberProperty, 2.5), 31.25);
        assert.equal(getPropertyValue(numberProperty, 5), 100);
        assert.equal(getPropertyValue(numberProperty, 7.5), 281.25);
        assert.equal(getPropertyValue(numberProperty, 10), 500);
        assert.equal(getPropertyValue(numberProperty, Infinity), 500);

        assert.equal(getPropertyValue(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValue(colorProperty, 0), 0xff0000);
        // rgb: [ 0.4375, 0.625, 0 ]
        assert.equal(getPropertyValue(colorProperty, 2.5), 0x6f9f00);
        assert.equal(getPropertyValue(colorProperty, 5), 0x00ff00);
        // rgb: [ 0, 0.625, 0.4375 ]
        assert.equal(getPropertyValue(colorProperty, 7.5), 0x009f6f);
        assert.equal(getPropertyValue(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValue(colorProperty, Infinity), 0x0000ff);
    });
    it("Exponential", () => {
        numberProperty.interpolationMode = InterpolationMode.Exponential;
        colorProperty.interpolationMode = InterpolationMode.Exponential;

        assert.equal(getPropertyValue(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValue(numberProperty, 0), 0);
        assert.equal(getPropertyValue(numberProperty, 2.5), 25);
        assert.equal(getPropertyValue(numberProperty, 5), 100);
        assert.equal(getPropertyValue(numberProperty, 7.5), 200);
        assert.equal(getPropertyValue(numberProperty, 10), 500);
        assert.equal(getPropertyValue(numberProperty, Infinity), 500);

        assert.equal(getPropertyValue(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValue(colorProperty, 0), 0xff0000);
        // rgb: [ 0.75, 0.25, 0 ]
        assert.equal(getPropertyValue(colorProperty, 2.5), 0xbf3f00);
        assert.equal(getPropertyValue(colorProperty, 5), 0x00ff00);
        // rgb: [ 0, 0.75, 0.25 ]
        assert.equal(getPropertyValue(colorProperty, 7.5), 0x00bf3f);
        assert.equal(getPropertyValue(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValue(colorProperty, Infinity), 0x0000ff);
    });
});
