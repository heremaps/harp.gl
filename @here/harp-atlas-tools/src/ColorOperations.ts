/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { RGBA } from "./ColorUtils";

export type ColorOperation = (src: RGBA) => RGBA;

/**
 * Inverts color component wiselly without changing its alpha factor.
 *
 * @param src - source color.
 * @return inverted color.
 */
export const ColorInvert: ColorOperation = (src: RGBA): RGBA => {
    if (src.a === 0) {
        return src;
    }
    const srcA = src.a !== undefined ? src.a : 255;
    return {
        r: 255 - src.r,
        g: 255 - src.g,
        b: 255 - src.b,
        a: srcA
    };
};

/**
 * Converts color to grayscale using lightness method.
 *
 * The lightness method averages the most prominent and least prominent colors:
 * (max(R, G, B) + min(R, G, B)) / 2.
 * This method tends to reduce overal contrast of the image.
 *
 * @param src - source color.
 * @return grayscale converted color.
 */
export const ColorGrayscaleLightness: ColorOperation = (src: RGBA): RGBA => {
    const srcA = src.a !== undefined ? src.a : 255;
    const lightness = Math.floor(
        (Math.max(src.r, src.g, src.b) + Math.min(src.r, src.g, src.b)) / 2
    );
    return {
        r: lightness,
        g: lightness,
        b: lightness,
        a: srcA
    };
};

/**
 * Converts color to grayscale using compontents averaging method.
 *
 * The average method simply averages the values of all 3 components:
 * (R + G + B) / 3.
 * This method may not produce natural pictures since all three different colors have
 * different wavelength thus in rallity their contribution to the image formation is
 * different, in average approach their contribution is assumed to be the same.
 *
 * @param src - source color.
 * @return grayscale converted color.
 */
export const ColorGrayscaleAverage: ColorOperation = (src: RGBA): RGBA => {
    const srcA = src.a !== undefined ? src.a : 255;
    const average = Math.min(Math.floor((src.r + src.g + src.b) / 3), 255);
    return {
        r: average,
        g: average,
        b: average,
        a: srcA
    };
};

/**
 * Converts color to grayscale using luminosity method.
 *
 * This method is slightly more sophisticated version of the averaging method.
 * It also averages the color components values, but it uses a weighted average to take
 * into account for human perception. Because human eye is more sensitive to green than
 * other colors, green compound is weighted most heavily. The weighter formula for
 * luminosity is:
 * 0.21*R + 0.72*G + 0.07*B.
 *
 * @param src - source color.
 * @return grayscale converted color.
 */
export const ColorGrayscaleLuminosity: ColorOperation = (src: RGBA): RGBA => {
    const srcA = src.a !== undefined ? src.a : 255;
    const luminosity = Math.min(Math.floor(src.r * 0.21 + src.g * 0.72 + src.b * 0.07), 255);
    return {
        r: luminosity,
        g: luminosity,
        b: luminosity,
        a: srcA
    };
};
