/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: Discuss flexibility and problems with two interfaces (all functions with RGBA support)
export interface RGB {
    r: number;
    g: number;
    b: number;
    a?: number;
}

export interface RGBA extends RGB {
    a: number;
}

export class ColorUtils {
    /**
     * Retreive red component of 32-bit color value.
     *
     * @param value - color value encoded in 32-bit number.
     * @returns color red component value in between 0 to 255.
     */
    static red(value: number): number {
        return value >> 24 >= 0 ? value >> 24 : 256 + (value >> 24);
    }

    /**
     * Retreive green component from 32-bit RGBA color value.
     *
     * @param value - color value encoded in 32-bit number.
     * @returns color green component value in between 0 to 255.
     */
    static green(value: number): number {
        return (value >> 16) & 255;
    }

    /**
     * Retreive blue component from 32-bit RGBA color value.
     *
     * @param value - color value encoded in 32-bit number.
     * @returns color blue component value in between 0 to 255.
     */
    static blue(value: number): number {
        return (value >> 8) & 255;
    }

    /**
     * Retreive alpha (opacity) component from 32-bit RGBA color value.
     *
     * @param value - color value encoded in 32-bit number.
     * @returns color alpha component value in between 0 to 255.
     */
    static alpha(value: number): number {
        return value & 255;
    }

    /**
     * Convert RGBA color object into integer value.
     *
     * @param c - color stored as RGBA object.
     * @returns 32-bit coded integer color value.
     */
    static rgbaToInt(c: RGBA): number {
        return ((c.a & 255) << 24) + (((c.b & 255) << 16) + ((c.g & 255) << 8) + (c.r & 255));
    }

    /**
     * Convert integer coded RGBA color into RGBA interface object.
     *
     * @param value - 32-bit coded integer color value.
     * @returns color stored in RGBA object instance.
     */
    static intToRgba(value: number): RGBA {
        const rgba: RGBA = {
            r: ColorUtils.red(value),
            g: ColorUtils.green(value),
            b: ColorUtils.blue(value),
            a: ColorUtils.alpha(value)
        };
        return rgba;
    }

    /**
     * Mix fg and bg color, taking alpha into account.
     *
     * @param {*} bg background color.
     * @param {*} fg foreground color.
     * @returns resulting color coder in 32-bit integer.
     */
    static mix(bg: number, fg: number): number {
        const factor = ColorUtils.alpha(fg) / 255;
        const color: RGBA = {
            r: ColorUtils.lerp(ColorUtils.red(bg), ColorUtils.red(fg), factor),
            g: ColorUtils.lerp(ColorUtils.green(bg), ColorUtils.green(fg), factor),
            b: ColorUtils.lerp(ColorUtils.blue(bg), ColorUtils.blue(fg), factor),
            a: ColorUtils.alpha(bg)
        };
        return ColorUtils.rgbaToInt(color);
    }

    /**
     * Mix fg and bg RGBA colors, taking alpha into account.
     *
     * @param {*} bg background color.
     * @param {*} fg foreground color.
     * @returns resulting color stored in RGBA object instance.
     */
    static mixRgba(bg: RGBA, fg: RGBA): RGBA {
        const factor = fg.a ? fg.a / 255 : 1;
        const color: RGBA = {
            r: ColorUtils.lerp(bg.r, fg.r, factor),
            g: ColorUtils.lerp(bg.g, fg.g, factor),
            b: ColorUtils.lerp(bg.b, fg.b, factor),
            a: bg.a
        };
        return color;
    }

    /**
     * Mix fg and bg color, taking alpha into account. (premultiplied alpha)
     *
     * @param {*} bg background color.
     * @param {*} fg foreground color.
     * @returns resulting color coder in 32-bit integer.
     */
    static mixPremultiplied(bg: number, fg: number): number {
        const factor = ColorUtils.alpha(fg) / 255;
        const color: RGBA = {
            r: Math.min(Math.floor(ColorUtils.red(bg) * (1 - factor) + ColorUtils.red(fg)), 255),
            g: Math.min(
                Math.floor(ColorUtils.green(bg) * (1 - factor) + ColorUtils.green(fg)),
                255
            ),
            b: Math.min(Math.floor(ColorUtils.blue(bg) * (1 - factor) + ColorUtils.blue(fg)), 255),
            a: ColorUtils.alpha(bg)
        };
        return ColorUtils.rgbaToInt(color);
    }

    /**
     * Mix fg and bg RGBA colors, taking alpha into account. (premultiplied alpha)
     *
     * @param {*} bg background color.
     * @param {*} fg foreground color.
     * @returns resulting color stored in RGBA object instance.
     */
    static mixPremultipliedRgba(bg: RGBA, fg: RGBA): RGBA {
        const factor = fg.a ? fg.a / 255 : 1;
        const color: RGBA = {
            r: Math.min(Math.floor(bg.r * (1 - factor) + fg.r), 255),
            g: Math.min(Math.floor(bg.g * (1 - factor) + fg.g), 255),
            b: Math.min(Math.floor(bg.b * (1 - factor) + fg.b), 255),
            a: bg.a ? bg.a : 255
        };
        return color;
    }

    private static lerp(c0: number, c1: number, factor: number): number {
        return Math.floor(c0 * (1 - factor) + c1 * factor);
    }
}
