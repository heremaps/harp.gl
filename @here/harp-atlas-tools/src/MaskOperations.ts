/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { RGBA } from "./ColorUtils";

export type MaskOperation = (dst: RGBA, mask: RGBA) => RGBA;

/**
 * Standard alpha mask which is applied over dst image whenever it is opaque.
 *
 * If mask pixel has alpha bigger then zero then color is unchanged otherwise color is
 * changed to fully transparent black piksel. Even if destination image does not specify
 * alpha channel value, resulting image will have alpha information afterwards.
 *
 * @param {RGBA} dst destination color, that may be considered as input color being masked.
 * @param {RGBA} mask mask color, that decides if input image is unchaged or fully-transparent.
 * @returns {RGBA} masking result (color).
 */
export const MaskAlpha: MaskOperation = (dst: RGBA, mask: RGBA): RGBA => {
    const dstA = dst.a !== undefined ? dst.a : 255;
    const maskA = mask.a !== undefined ? mask.a : 255;
    return {
        r: maskA > 0 ? dst.r : 0,
        g: maskA > 0 ? dst.g : 0,
        b: maskA > 0 ? dst.b : 0,
        a: maskA > 0 ? dstA : 0
    };
};
