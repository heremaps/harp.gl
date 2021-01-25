/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { MathUtils } from "../lib/math/MathUtils";

const epsilon = 0.000001;

describe("MathUtils", function () {
    it("angleDistanceDeg", function () {
        assert.approximately(MathUtils.angleDistanceDeg(90, 0), 90, epsilon);
        assert.approximately(MathUtils.angleDistanceDeg(0, -90), 90, epsilon);
        assert.approximately(MathUtils.angleDistanceDeg(0, 180), 180, epsilon);
        assert.approximately(MathUtils.angleDistanceDeg(45, -45), 90, epsilon);
        assert.approximately(MathUtils.angleDistanceDeg(-179, 1), 180, epsilon);
        assert.approximately(MathUtils.angleDistanceDeg(1, 359), 2, epsilon);
        assert.approximately(MathUtils.angleDistanceDeg(359, 1), -2, epsilon);
    });

    it("interpolateAnglesRad basics", function () {
        assert.approximately(MathUtils.interpolateAnglesDeg(0, 90, 0), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(0, 180, 0), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(0, 360, 0), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(0, 360, 1), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(1800, 3600, 0), 0, epsilon);

        assert.approximately(MathUtils.interpolateAnglesDeg(90, 0, 0), 90, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(180, 0, 0), 180, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(360, 0, 0), 0, epsilon);

        assert.approximately(MathUtils.interpolateAnglesDeg(90, 0, 1), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(180, 0, 1), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(3600, 0, 1), 0, epsilon);

        assert.approximately(MathUtils.interpolateAnglesDeg(0, 90, 0.5), 45, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(0, -90, 0.5), -45, epsilon);
    });

    it("interpolateAnglesRad corner cases", function () {
        assert.approximately(MathUtils.interpolateAnglesDeg(-1, 1, 0.5), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(-90, 90, 0.5), 0, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(-91, 91, 0.5), -180, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(-1, 179, 0.5), 89, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(-1, 179, 0.5), 89, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(1, 180, 0.5), 90.5, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(1, 181, 0.5), 91, epsilon);
        assert.approximately(MathUtils.interpolateAnglesDeg(1, 182, 0.5), -88.5, epsilon);
    });
});
