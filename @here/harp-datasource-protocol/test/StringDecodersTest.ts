/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

//    Allow bitwise operations for colors decoding tests

import { assert } from "chai";

import { ColorUtils } from "../lib/ColorUtils";
import { parseStringEncodedNumeral } from "../lib/StringEncodedNumeral";

describe("StringEncodedNumeral", function () {
    it("Meters", () => {
        testMetric("m");
    });
    it("Pixels", () => {
        testMetric("px");
    });
    it("HEX Colors", () => {
        testHexColor();
    });
    it("RGB Colors", () => {
        testRGBColor();
    });
    it("RGBA Colors", () => {
        // TODO: Update RGBA colors test when HARP-7517 is done.
        testRGBAColor();
    });
    it("HSL Colors", () => {
        testHSLColor();
    });
});

function testMetric(posix: string) {
    assert.strictEqual(parseStringEncodedNumeral(`0${posix}`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`0.${posix}`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`0.0${posix}`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`0.1${posix}`), 0.1);
    assert.strictEqual(parseStringEncodedNumeral(`0.000000001${posix}`), 0.000000001);
    assert.strictEqual(parseStringEncodedNumeral(`0.123456789${posix}`), 0.123456789);

    assert.strictEqual(parseStringEncodedNumeral(`1${posix}`), 1);
    assert.strictEqual(parseStringEncodedNumeral(`1.${posix}`), 1);
    assert.strictEqual(parseStringEncodedNumeral(`1.0${posix}`), 1);
    assert.strictEqual(parseStringEncodedNumeral(`1.1${posix}`), 1.1);
    assert.strictEqual(parseStringEncodedNumeral(`1.123456789${posix}`), 1.123456789);

    assert.strictEqual(parseStringEncodedNumeral(`123456789${posix}`), 123456789);
    assert.strictEqual(parseStringEncodedNumeral(`123456789.${posix}`), 123456789);
    assert.strictEqual(parseStringEncodedNumeral(`123456789.0${posix}`), 123456789);

    const epsilon = 1e-20;
    assert.strictEqual(parseStringEncodedNumeral(`${epsilon.toFixed(20)}${posix}`), epsilon);
    assert.strictEqual(
        parseStringEncodedNumeral(`${Number.MAX_SAFE_INTEGER}${posix}`),
        Number.MAX_SAFE_INTEGER
    );
    assert.strictEqual(
        parseStringEncodedNumeral(`${Number.MAX_SAFE_INTEGER}.${posix}`),
        Number.MAX_SAFE_INTEGER
    );
    assert.strictEqual(
        parseStringEncodedNumeral(`${Number.MAX_SAFE_INTEGER}.0${posix}`),
        Number.MAX_SAFE_INTEGER
    );

    // Metrics may not have negative values (nor signed values)
    assert.isUndefined(parseStringEncodedNumeral(`+10${posix}`));
    assert.isUndefined(parseStringEncodedNumeral(`-10${posix}`));
    assert.isUndefined(parseStringEncodedNumeral(`- 10${posix}`));

    assert.isUndefined(parseStringEncodedNumeral(`10m in wrong format`));
    assert.isUndefined(parseStringEncodedNumeral(`this is wrong metric 10${posix}`));
    assert.isUndefined(
        parseStringEncodedNumeral(`metric 10${posix} may not be surrounded with words`)
    );

    assert.isUndefined(parseStringEncodedNumeral(` 10${posix}`));
    assert.isUndefined(parseStringEncodedNumeral(`10${posix} `));
    assert.isUndefined(parseStringEncodedNumeral(`10 ${posix}`));
}

function testHexColor() {
    // HEX color literal may be written in abbreviated three hexadecimal-digit form - #RGB format
    assert.strictEqual(parseStringEncodedNumeral(`#000`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`#00F`), 255 << 0);
    assert.strictEqual(parseStringEncodedNumeral(`#0F0`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`#F00`), 255 << 16);

    // HEX literal may be written in six digit (hexadecimal) form - #RRGGBB
    assert.strictEqual(parseStringEncodedNumeral(`#000000`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`#0000FF`), 255 << 0);
    assert.strictEqual(parseStringEncodedNumeral(`#00FF00`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`#FF0000`), 255 << 16);

    // HEX should support RGBA colors in 4 and 8 digit form, alpha component is stored in
    // the last octet (#RRGGBBAA or #RGBA), then the value of the octet (0-255) is inverted
    // so we actually store transparency instead of opacity. This is to preserve compatibility
    // with other libraries that do not support alpha channel (THREE.js). In other words
    // #000000FF (black with full alpha) will be equal to #000000 (black no alpha).

    // HEX Color in #RGBA format - 4 digits
    assert.strictEqual(parseStringEncodedNumeral(`#0000`), 255 << 24);
    assert.strictEqual(parseStringEncodedNumeral(`#000F`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`#00F0`), (255 << 0) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`#00FF`), 255 << 0);
    assert.strictEqual(parseStringEncodedNumeral(`#0F00`), (255 << 8) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`#0F0F`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`#F000`), (255 << 16) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`#F00F`), 255 << 16);

    // HEX Color in #RRGGBBAA format - 8 digits
    assert.strictEqual(parseStringEncodedNumeral(`#00000000`), 255 << 24);
    assert.strictEqual(parseStringEncodedNumeral(`#000000FF`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`#0000FF00`), (255 << 0) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`#0000FFFF`), 255 << 0);
    assert.strictEqual(parseStringEncodedNumeral(`#00FF0000`), (255 << 8) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`#00FF00FF`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`#FF000000`), (255 << 16) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`#FF0000FF`), 255 << 16);

    assert.strictEqual(parseStringEncodedNumeral(` #FFF`), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(`#FFF `), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(` #FFF `), 0xffffff);

    // Do not allow embedding into sentence
    assert.isUndefined(parseStringEncodedNumeral(`can not be color #FFF`));
    assert.isUndefined(parseStringEncodedNumeral(`#FFF may not be used`));
    assert.isUndefined(parseStringEncodedNumeral(`this is#000also wrong`));

    // Do not mix with other literals
    assert.isUndefined(parseStringEncodedNumeral(`#000px`));
    assert.isUndefined(parseStringEncodedNumeral(`#000m`));
    assert.isUndefined(parseStringEncodedNumeral(`#555m`));
    assert.isUndefined(parseStringEncodedNumeral(`#555px`));
    assert.isUndefined(parseStringEncodedNumeral(`#10.0m`));
    assert.isUndefined(parseStringEncodedNumeral(`#m`));
    assert.isUndefined(parseStringEncodedNumeral(`#px`));

    // weird color format!
    assert.strictEqual(parseStringEncodedNumeral(`#10.5px`), 0x000010);
}

function testRGBColor() {
    // RGB color literal may be written as `rgb(r,g,b)` expression, where each
    // component: r, g, b may be between <0, 255> and should be discreet number.
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0,0,0)`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(255,0,0)`), 255 << 16);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0,255,0)`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0,0,255)`), 255 << 0);

    // One space is allowed after opening and before closing brackets, just for reading comfort.
    assert.strictEqual(
        parseStringEncodedNumeral(`rgb( 255,255,255 )`),
        (255 << 16) | (255 << 8) | 255
    );

    // Single spaces after colons are also accepted.
    assert.strictEqual(
        parseStringEncodedNumeral(`rgb(100, 255, 100)`),
        (100 << 16) | (255 << 8) | 100
    );
    assert.strictEqual(
        parseStringEncodedNumeral(`rgb( 55, 255, 55 )`),
        (55 << 16) | (255 << 8) | 55
    );

    // accept spaces before the colon.
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0 ,0,0)`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0,0 ,0)`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0 , 0 ,0)`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgb( 0 , 0 ,0 )`), 0);

    // RGB expression may not be preceded or followed by any characters,
    // even white chars (spaces) are disallowed.
    assert.isUndefined(parseStringEncodedNumeral(`not my favorite color rgb(0,0,0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgb(0,0,0) neither this one`));

    assert.isUndefined(parseStringEncodedNumeral(`rgb(0,0,0)a`));
    assert.isUndefined(parseStringEncodedNumeral(`argb(0,0,0)`));

    assert.strictEqual(parseStringEncodedNumeral(` rgb(255,255,255)`), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(255,255,255) `), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(` rgb(255,255,255) `), 0xffffff);

    // strange literals
    assert.isUndefined(parseStringEncodedNumeral(`#rgb(0,0,0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgb(#FF,0,0)`));
    assert.strictEqual(parseStringEncodedNumeral(`rgb(0,0,1.0)`), 0x000001);
    assert.strictEqual(parseStringEncodedNumeral(`rgb(1.0,0,0)`), 0x010000);
    assert.isUndefined(parseStringEncodedNumeral(`rgba(0,0,1.0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgba(255,255,255)`));
}

function testRGBAColor() {
    // RGBA color literal may be written as `rgba(r,g,b,a)` expression, where each
    // color channel (r, g, b) should be discreet number between <0, 255> and alpha
    // channel value (a) is passed as floating point number in <0.0, 1.0> range.
    // Keep in mind that decoded from rgba(0, 0, 0, 1.0) equals the one from rgb(0, 0, 0),
    // cause full alpha (1.0) will be encoded as transparency:
    // T = 255 - (1 * 255) with 24 bits shift.
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,0,0.0)`), 255 << 24);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,0,.0)`), 255 << 24);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,0,.5)`), 255 << 31);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,0,1.0)`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(255,0,0,1.0)`), 255 << 16);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(255,0,0,0.0)`), (255 << 16) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,255,0,1.0)`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,255,0,0.0)`), (255 << 8) | (255 << 24));
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,255,1.0)`), 255 << 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,255,0.0)`), (255 << 0) | (255 << 24));

    // One space is allowed after opening and before closing brackets, just for reading comfort.
    assert.strictEqual(
        parseStringEncodedNumeral(`rgba( 255,255,255,0.5 )`),
        (128 << 24) | (255 << 16) | (255 << 8) | 255
    );

    // Single spaces after colons are also accepted.
    assert.strictEqual(
        parseStringEncodedNumeral(`rgba(100, 255, 100, 0.5)`),
        (128 << 24) | (100 << 16) | (255 << 8) | 100
    );
    assert.strictEqual(
        parseStringEncodedNumeral(`rgba( 55, 255, 55, 0.1 )`),
        (230 << 24) | (55 << 16) | (255 << 8) | 55
    );

    // accept spaces before the colon.
    const black = ColorUtils.getHexFromRgba(0, 0, 0, 0);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0 ,0,0,0)`), black);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0 ,0,0)`), black);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,0 ,0)`), black);
    assert.strictEqual(parseStringEncodedNumeral(`rgba( 0 , 0 , 0 , 0 )`), black);

    // Expression may not be preceded or followed by any characters,
    // even white chars (spaces) are disallowed.
    assert.isUndefined(parseStringEncodedNumeral(`not my favorite one rgba(0,0,0,0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgba(0,0,0) neither this`));

    assert.isUndefined(parseStringEncodedNumeral(`rgba(0,0,0,0)a`));
    assert.isUndefined(parseStringEncodedNumeral(`xrgba(0,0,0)`));

    assert.strictEqual(parseStringEncodedNumeral(` rgba(255,255,255,1)`), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(`rgba(255,255,255,1) `), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(` rgba(255,255,255,1) `), 0xffffff);

    // Do not mix with other literals
    assert.isUndefined(parseStringEncodedNumeral(`#rgba(0,0,0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgba(#FF,0,0,1)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgba(0,0,0,#FF)`));
    assert.strictEqual(parseStringEncodedNumeral(`rgba(0,0,0,255)`), 0x000000);
    assert.isUndefined(parseStringEncodedNumeral(`rgba(0,0,1.0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgba(1.0,0,0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgb(0,0,0,1.0)`));
    assert.isUndefined(parseStringEncodedNumeral(`rgb(255,255,255,1.0)`));
}

function testHSLColor() {
    // HSL color literal may be written in form of `hsl(h,s%,l%)` expression.
    // Its color components (h, s, l) are defined as follows:
    // * h - hue discreet value in <0,360> range (no floating point allowed),
    // * s - saturation in <0,100> range followed by percent ("%") character,
    // * l - lightness value, also discreet in range <0,100> followed with percent.
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,0%,0%)`), 0);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,100%,50%)`), 255 << 16);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(120,100%,50%)`), 255 << 8);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(240,100%,50%)`), 255 << 0);
    assert.strictEqual(
        parseStringEncodedNumeral(`hsl(0,100%,100%)`),
        (255 << 16) | (255 << 8) | 255
    );
    assert.sameMembers(
        [
            parseStringEncodedNumeral(`hsl(120,100%,100%)`),
            parseStringEncodedNumeral(`hsl(240,100%,100%)`)
        ],
        [
            parseStringEncodedNumeral(`hsl(0,100%,100%)`),
            parseStringEncodedNumeral(`hsl(360,100%,100%)`)
        ]
    );

    // One space is allowed after opening and before closing brackets, just for reading comfort.
    assert.strictEqual(
        parseStringEncodedNumeral(`hsl( 0,100%,100% )`),
        (255 << 16) | (255 << 8) | 255
    );

    // Single spaces after colons are also accepted.
    assert.strictEqual(parseStringEncodedNumeral(`hsl(90, 100%, 50%)`), 0x80ff00);
    assert.strictEqual(parseStringEncodedNumeral(`hsl( 90, 50%, 50% )`), 0x80bf40);

    // accept spaces between value and percent.
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,0 %,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,0%,0 %)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,0 %,0 %)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0, 0 %, 0 %)`), 0x000000);

    // accept spaces before the colon.
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0 ,0%,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,0% ,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0 ,0% ,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl( 0 , 0% ,0 )`), 0x000000);

    // spaces between hsl and opening bracket.
    assert.strictEqual(parseStringEncodedNumeral(`hsl (0,0%,0%)`), 0x000000);

    // Expression may not be preceded or followed by any characters,
    assert.isUndefined(parseStringEncodedNumeral(`not a hsl color hsl(0,0%,0%)`));
    assert.isUndefined(parseStringEncodedNumeral(`hsl(0,0%,0%) neither this one`));

    assert.isUndefined(parseStringEncodedNumeral(`hsl(0,0%,0%)a`));
    assert.isUndefined(parseStringEncodedNumeral(`hsla(0,0%,0%)`));
    assert.isUndefined(parseStringEncodedNumeral(`ahsl(0,0%,0%)`));

    assert.strictEqual(parseStringEncodedNumeral(` hsl(0,100%,100%)`), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,100%,100%) `), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(` hsl(0,100%,100%) `), 0xffffff);

    // strange literals
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,0,0)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(#00,0%,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(#FF,0%,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(1.0,0%,0%)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(0,255,0)`), 0x000000);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(255,255,255)`), 0xffffff);
    assert.strictEqual(parseStringEncodedNumeral(`hsl(255,255%,255%)`), 0xffffff);
    assert.isUndefined(parseStringEncodedNumeral(`hsl(0,0%,0%,1.0)`));
}
