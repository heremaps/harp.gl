/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { ColorCache } from "../lib/ColorCache";

describe("ColorCache", function() {
    it("empty", function() {
        assert.equal(ColorCache.instance.size, 0);
    });

    it("get", function() {
        const white = ColorCache.instance.getColor("#ffffff");
        const black = ColorCache.instance.getColor("#000000");

        assert.equal(ColorCache.instance.size, 2);

        assert.exists(white);
        assert.exists(black);

        assert.equal(white.r, 1.0);
        assert.equal(white.g, 1.0);
        assert.equal(white.b, 1.0);

        assert.equal(black.r, 0.0);
        assert.equal(black.g, 0.0);
        assert.equal(black.b, 0.0);
    });

    it("clear", function() {
        const white = ColorCache.instance.getColor("#ffffff");
        const black = ColorCache.instance.getColor("#000000");

        assert.equal(ColorCache.instance.size, 2);

        assert.exists(white);
        assert.exists(black);

        ColorCache.instance.clear();

        assert.equal(ColorCache.instance.size, 0);
    });
});
