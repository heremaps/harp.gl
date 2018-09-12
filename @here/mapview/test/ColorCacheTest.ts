/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { assert } from "chai";

import { ColorCache } from "../lib/ColorCache";

describe("ColorCache", () => {
    it("empty", () => {
        assert.equal(ColorCache.instance.size, 0);
    });

    it("get", () => {
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

    it("clear", () => {
        const white = ColorCache.instance.getColor("#ffffff");
        const black = ColorCache.instance.getColor("#000000");

        assert.equal(ColorCache.instance.size, 2);

        assert.exists(white);
        assert.exists(black);

        ColorCache.instance.clear();

        assert.equal(ColorCache.instance.size, 0);
    });
});
