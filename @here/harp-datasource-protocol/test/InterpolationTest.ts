/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { SceneState } from "../lib/DynamicTechniqueAttr";
import { getPropertyValue } from "../lib/InterpolatedProperty";
import { InterpolatedProperty, InterpolationMode } from "../lib/InterpolatedPropertyDefs";
import { StringEncodedNumeralType } from "../lib/StringEncodedNumeral";

const levels = new Float32Array([0, 5, 10]);
const numberProperty: InterpolatedProperty<number> = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    values: new Float32Array([0, 100, 500])
};
const booleanProperty: InterpolatedProperty<boolean> = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    values: new Float32Array([1.0, 0.0, 1.0])
};
const colorProperty: InterpolatedProperty<string> = {
    interpolationMode: InterpolationMode.Discrete,
    zoomLevels: levels,
    values: new Float32Array([0, 1, 0.5, 120 / 360, 1, 0.5, 240 / 360, 1, 0.5]),
    _stringEncodedNumeralType: StringEncodedNumeralType.Hex
};

function getPropertyValueZoom(
    value: InterpolatedProperty<any> | number | string,
    zoomLevel: number
) {
    return getPropertyValue(value, ({ zoomLevel } as unknown) as SceneState);
}
describe("Interpolation", function() {
    it("Discrete", () => {
        assert.equal(getPropertyValueZoom(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 0), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 2.5), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 5), 100);
        assert.equal(getPropertyValueZoom(numberProperty, 7.5), 100);
        assert.equal(getPropertyValueZoom(numberProperty, 10), 500);
        assert.equal(getPropertyValueZoom(numberProperty, Infinity), 500);

        assert.equal(getPropertyValueZoom(booleanProperty, -Infinity), 1);
        assert.equal(getPropertyValueZoom(booleanProperty, 0), 1);
        assert.equal(getPropertyValueZoom(booleanProperty, 2.5), 1);
        assert.equal(getPropertyValueZoom(booleanProperty, 5), 0);
        assert.equal(getPropertyValueZoom(booleanProperty, 7.5), 0);
        assert.equal(getPropertyValueZoom(booleanProperty, 10), 1);
        assert.equal(getPropertyValueZoom(booleanProperty, Infinity), 1);

        assert.equal(getPropertyValueZoom(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 0), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 2.5), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 5), 0x00ff00);
        assert.equal(getPropertyValueZoom(colorProperty, 7.5), 0x00ff00);
        assert.equal(getPropertyValueZoom(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValueZoom(colorProperty, Infinity), 0x0000ff);
    });
    it("Linear", () => {
        numberProperty.interpolationMode = InterpolationMode.Linear;
        colorProperty.interpolationMode = InterpolationMode.Linear;

        assert.equal(getPropertyValueZoom(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 0), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 2.5), 50);
        assert.equal(getPropertyValueZoom(numberProperty, 5), 100);
        assert.equal(getPropertyValueZoom(numberProperty, 7.5), 300);
        assert.equal(getPropertyValueZoom(numberProperty, 10), 500);
        assert.equal(getPropertyValueZoom(numberProperty, Infinity), 500);

        assert.equal(getPropertyValueZoom(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 0), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 2.5), 0xfeff00);
        assert.equal(getPropertyValueZoom(colorProperty, 5), 0x00ff00);
        assert.equal(getPropertyValueZoom(colorProperty, 7.5), 0x00feff);
        assert.equal(getPropertyValueZoom(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValueZoom(colorProperty, Infinity), 0x0000ff);
    });
    it("Cubic", () => {
        numberProperty.interpolationMode = InterpolationMode.Cubic;
        colorProperty.interpolationMode = InterpolationMode.Cubic;

        assert.equal(getPropertyValueZoom(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 0), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 2.5), 31.25);
        assert.equal(getPropertyValueZoom(numberProperty, 5), 100);
        assert.equal(getPropertyValueZoom(numberProperty, 7.5), 281.25);
        assert.equal(getPropertyValueZoom(numberProperty, 10), 500);
        assert.equal(getPropertyValueZoom(numberProperty, Infinity), 500);

        assert.equal(getPropertyValueZoom(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 0), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 2.5), 0xfeff00);
        assert.equal(getPropertyValueZoom(colorProperty, 5), 0x00ff00);
        assert.equal(getPropertyValueZoom(colorProperty, 7.5), 0x00feff);
        assert.equal(getPropertyValueZoom(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValueZoom(colorProperty, Infinity), 0x0000ff);
    });
    it("Exponential", () => {
        numberProperty.interpolationMode = InterpolationMode.Exponential;
        colorProperty.interpolationMode = InterpolationMode.Exponential;

        assert.equal(getPropertyValueZoom(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 0), 0);
        assert.equal(getPropertyValueZoom(numberProperty, 2.5), 25);
        assert.equal(getPropertyValueZoom(numberProperty, 5), 100);
        assert.equal(getPropertyValueZoom(numberProperty, 7.5), 200);
        assert.equal(getPropertyValueZoom(numberProperty, 10), 500);
        assert.equal(getPropertyValueZoom(numberProperty, Infinity), 500);

        assert.equal(getPropertyValueZoom(colorProperty, -Infinity), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 0), 0xff0000);
        assert.equal(getPropertyValueZoom(colorProperty, 2.5), 0xff7f00);
        assert.equal(getPropertyValueZoom(colorProperty, 5), 0x00ff00);
        assert.equal(getPropertyValueZoom(colorProperty, 7.5), 0x00ff7f);
        assert.equal(getPropertyValueZoom(colorProperty, 10), 0x0000ff);
        assert.equal(getPropertyValueZoom(colorProperty, Infinity), 0x0000ff);
    });
});
