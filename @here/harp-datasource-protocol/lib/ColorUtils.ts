/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
import * as THREE from "three";

import { RGBA } from "./RGBA";

const SHIFT_TRANSPARENCY: number = 24;
const SHIFT_RED: number = 16;
const SHIFT_GREEN: number = 8;
const SHIFT_BLUE: number = 0;

//    Allow bitwise operations for colors decoding

const HEX_FULL_CHANNEL: number = 0xff;
const HEX_RGB_MASK: number = 0xffffff;
const HEX_TRGB_MASK: number = 0xffffffff;

const tmpColor = new THREE.Color();

/**
 * Utilities to convert RGBA colors encoded in custom number (hex) format to THREE.Color objects.
 *
 * The functions provided allows for conversion from and to our custom number based color format,
 * which contains transparency, red, green and blue color channels in a way that each channel
 * occupies 8 bits of resulting number (color format 0xTTRRGGBB).
 * In order to preserve compatibility with THREE.Color class and its hexadecimal color
 * representation, we do not store __alpha__ channel in encoded color's number, but replace it
 * with __transparency__ channel, which is simply opposite to alpha:
 * ```transparency = 0xFF - alpha```
 * Such channel value is stored on the oldest bits (octet) in the integral color (numeric) value,
 * so it is fully compatible with THREE.Color numerical representation (@see [[THREE.Color.getHex]],
 * [[THREE.Color.setHex]]).
 * See also [[getHexFromRgba]] and [[getRgbaFromHex]] for more info about conversion.
 */
export namespace ColorUtils {
    /**
     * Encodes RGBA channels in custom number coded format (represented in hex as 0xTTRRGGBB).
     *
     * We do not use direct alpha channel mapping to hex in order to preserve compatibility
     * with THREE.js color format (0xRRGGBB). This is done by encoding transparency
     * (255 - alpha) instead of alpha on the oldest bits, shifted by [[SHIFT_TRANSPARENCY]].
     * This way simple 0xRRGGBB color is equal to 0x00RRGGBB without transparency and
     * color defining transparency (alpha < 255) is always recognizable by the oldest
     * bit set:
     * ```typescript
     * (color >> SHIFT_TRANSPARENCY) !== 0.
     * ```
     * @note All input components are floating points in <0, 1> range (inclusively).
     * @note Although method encodes transparency channel in single number value, it is still
     * compatible with THREE.js number based color coding (0xRRGGBB), so you may pass this value to
     * [[THREE.Color]] c-tor, but keep in mind that transparency will be silently ignored.
     */
    export function getHexFromRgba(r: number, g: number, b: number, a: number): number {
        assert(a >= 0 && a <= 1);
        const t = HEX_FULL_CHANNEL - Math.floor(a * HEX_FULL_CHANNEL);
        return (
            (t << SHIFT_TRANSPARENCY) ^
            ((r * HEX_FULL_CHANNEL) << SHIFT_RED) ^
            ((g * HEX_FULL_CHANNEL) << SHIFT_GREEN) ^
            ((b * HEX_FULL_CHANNEL) << SHIFT_BLUE)
        );
    }

    /**
     * Encodes RGB all color channels in single number with format 0xRRGGBB.
     *
     * All input channels should be in <0, 1> range (inclusively).
     * See also [[getHexFromRgba]] for more information about [[THREE.Color]] compatibility.
     *
     * @note This method is fully compatible with THREE.js color encoding, so
     * you may pass this value directly to THREE.Color c-tor.
     */
    export function getHexFromRgb(r: number, g: number, b: number): number {
        assert(r >= 0 && r <= 1);
        assert(g >= 0 && g <= 1);
        assert(b >= 0 && b <= 1);
        return (
            ((r * HEX_FULL_CHANNEL) << SHIFT_RED) ^
            ((g * HEX_FULL_CHANNEL) << SHIFT_GREEN) ^
            ((b * HEX_FULL_CHANNEL) << SHIFT_BLUE)
        );
    }

    /**
     * Encode and convert HSL value to number coded color format (0xRRGGBB).
     *
     * @see getHexFromRgb.
     * @param h - Hue component value between 0 and 1.
     * @param s - Saturation value between 0 and 1.
     * @param l - Lightness channel between 0 and 1.
     */
    export function getHexFromHsl(h: number, s: number, l: number): number {
        assert(h >= 0 && h <= 1);
        assert(s >= 0 && s <= 1);
        assert(l >= 0 && l <= 1);
        return tmpColor.setHSL(h, s, l).getHex();
    }

    /**
     * Retrieve RGBA channels separately from number encoded custom color format.
     *
     * Provides an easy way for channels extraction (r, g, b, a) from custom number coded color
     * format.
     *
     * @see getHexFromRgba.
     * @param hex - The number encoded color value (0xRRGGBB or 0xTTRRGGBB in hex).
     * @returns r, g, b, a channels in simple object, where each channel value is saved as floating
     * point from 0 to 1 inclusively.
     */
    export function getRgbaFromHex(hex: number, target = new RGBA()): RGBA {
        assert((hex & ~HEX_TRGB_MASK) === 0, "Wrong hex format");
        target.r = ((hex >> SHIFT_RED) & HEX_FULL_CHANNEL) / HEX_FULL_CHANNEL;
        target.g = ((hex >> SHIFT_GREEN) & HEX_FULL_CHANNEL) / HEX_FULL_CHANNEL;
        target.b = ((hex >> SHIFT_BLUE) & HEX_FULL_CHANNEL) / HEX_FULL_CHANNEL;
        target.a =
            (HEX_FULL_CHANNEL - ((hex >> SHIFT_TRANSPARENCY) & HEX_FULL_CHANNEL)) /
            HEX_FULL_CHANNEL;
        return target;
    }

    /**
     * Determines if number encoded color contains alpha (opacity) defined and different then 255.
     *
     * @param hex - The number encoded color (0xRRGGBB or 0xTTRRGGBB in hex).
     * @returns True if color has transparency defined.
     */
    export function hasAlphaInHex(hex: number): boolean {
        assert((hex & ~HEX_TRGB_MASK) === 0, "Wrong hex format");
        return hex >> SHIFT_TRANSPARENCY !== 0;
    }

    /**
     * Retrieves alpha color channel from hex encoded color value.
     *
     * @see getHexFromRgba.
     * @param hex - The number encoded color value (representable as 0xRRGGBB or 0xTTRRGGBB in hex).
     * @returns The floating point alpha component in <0, 1> range.
     */
    export function getAlphaFromHex(hex: number): number {
        assert((hex & ~HEX_TRGB_MASK) === 0, "Wrong hex format");
        return (
            ((HEX_FULL_CHANNEL - (hex >> SHIFT_TRANSPARENCY)) & HEX_FULL_CHANNEL) / HEX_FULL_CHANNEL
        );
    }

    /**
     * Remove transparency info from the number coded color, makes it compatible with external libs.
     *
     * @see getAlphaFromHex.
     * @param hex - The number encoded color value (representable as 0xRRGGBB or 0xTTRRGGBB in hex).
     * @returns number coded color value representable as 0xRRGGBB in hex.
     */
    export function removeAlphaFromHex(hex: number): number {
        assert((hex & ~HEX_TRGB_MASK) === 0, "Wrong hex format");
        return hex & HEX_RGB_MASK;
    }
}
