/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { ContextualArabicConverter } from "../lib/ContextualArabicConverter";

describe("ContextualArabicConverter", function() {
    const textA = ContextualArabicConverter.instance.convert("مصر");
    const codepointsA = [0xfee3, 0xfebc, 0xfeae];
    const textB = ContextualArabicConverter.instance.convert(
        "The title is مفتاح معايير الويب in Arabic."
    );
    const codepointsB = [
        0x0054,
        0x0068,
        0x0065,
        0x0020,
        0x0074,
        0x0069,
        0x0074,
        0x006c,
        0x0065,
        0x0020,
        0x0069,
        0x0073,
        0x0020,
        0xfee3,
        0xfed4,
        0xfe98,
        0xfe8e,
        0x062d,
        0x0020,
        0xfee3,
        0xfecc,
        0xfe8e,
        0xfef3,
        0xfef4,
        0xfeae,
        0x0020,
        0x0627,
        0xfedf,
        0xfeee,
        0xfef3,
        0xfe90,
        0x0020,
        0x0069,
        0x006e,
        0x0020,
        0x0041,
        0x0072,
        0x0061,
        0x0062,
        0x0069,
        0x0063,
        0x002e
    ];

    it("Arabic", function() {
        let result = true;
        for (let i = 0; i < textA.length; ++i) {
            result = result && textA.charCodeAt(i) === codepointsA[i];
        }
        assert(result);
    });

    it("Latin-Arabic", function() {
        let result = true;
        for (let i = 0; i < textB.length; ++i) {
            result = result && textB.charCodeAt(i) === codepointsB[i];
        }
        assert(result);
    });
});
