/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { getPropertyValue, InterpolatedProperty, InterpolationMode } from "../lib/Techniques";

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
    values: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
};

describe("Interpolation", function() {
    it("Discrete", () => {
        assert.equal(getPropertyValue(numberProperty, -Infinity), 0);
        assert.equal(getPropertyValue(numberProperty, 0), 0);
        assert.equal(getPropertyValue(numberProperty, 2.5), 0);
        assert.equal(getPropertyValue(numberProperty, 5), 100);
        assert.equal(getPropertyValue(numberProperty, 7.5), 100);
        assert.equal(getPropertyValue(numberProperty, 10), 500);
        assert.equal(getPropertyValue(numberProperty, Infinity), 500);

        assert.equal(getPropertyValue(booleanProperty, -Infinity), true);
        assert.equal(getPropertyValue(booleanProperty, 0), true);
        assert.equal(getPropertyValue(booleanProperty, 2.5), true);
        assert.equal(getPropertyValue(booleanProperty, 5), false);
        assert.equal(getPropertyValue(booleanProperty, 7.5), false);
        assert.equal(getPropertyValue(booleanProperty, 10), true);
        assert.equal(getPropertyValue(booleanProperty, Infinity), true);

        assert.equal(getPropertyValue(colorProperty, -Infinity), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 0), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 2.5), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 5), "#00ff00");
        assert.equal(getPropertyValue(colorProperty, 7.5), "#00ff00");
        assert.equal(getPropertyValue(colorProperty, 10), "#0000ff");
        assert.equal(getPropertyValue(colorProperty, Infinity), "#0000ff");
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

        assert.equal(getPropertyValue(colorProperty, -Infinity), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 0), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 2.5), "#7f7f00");
        assert.equal(getPropertyValue(colorProperty, 5), "#00ff00");
        assert.equal(getPropertyValue(colorProperty, 7.5), "#007f7f");
        assert.equal(getPropertyValue(colorProperty, 10), "#0000ff");
        assert.equal(getPropertyValue(colorProperty, Infinity), "#0000ff");
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

        assert.equal(getPropertyValue(colorProperty, -Infinity), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 0), "#ff0000");
        assert.equal(getPropertyValue(colorProperty, 2.5), "#6f9f00");
        assert.equal(getPropertyValue(colorProperty, 5), "#00ff00");
        assert.equal(getPropertyValue(colorProperty, 7.5), "#009f6f");
        assert.equal(getPropertyValue(colorProperty, 10), "#0000ff");
        assert.equal(getPropertyValue(colorProperty, Infinity), "#0000ff");
    });
});
