/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { ColorUtils } from "../lib/ColorUtils";

// tslint:disable:only-arrow-functions
// tslint:disable:no-bitwise

describe("ColorUtils", function() {
    it("support rgba in signed int range", function() {
        const encoded = ColorUtils.getHexFromRgba(0.1, 0.5, 1.0, 0.1)!;
        assert.isNumber(encoded);
        assert.isBelow(encoded, 0);

        const decodedAlpha = ColorUtils.getAlphaFromHex(encoded);
        assert.approximately(decodedAlpha, 0.1, 1 / 255);

        const decoded = ColorUtils.getRgbaFromHex(encoded);
        assert.approximately(decoded.r, 0.1, 1 / 255);
        assert.approximately(decoded.g, 0.5, 1 / 255);
        assert.approximately(decoded.b, 1.0, 1 / 255);
        assert.approximately(decoded.a, 0.1, 1 / 255);
    });
});
