/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @hidden
 */
export function isArrayBufferLike(data: any): data is ArrayBufferLike {
    if (typeof SharedArrayBuffer !== "undefined") {
        return data instanceof ArrayBuffer || data instanceof SharedArrayBuffer;
    } else {
        return data instanceof ArrayBuffer;
    }
}

/**
 * @hidden
 */
export function lat2tile(lat: number, zoom: number): number {
    return Math.floor(
        ((1 -
            Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
                Math.PI) /
            2) *
            Math.pow(2, zoom)
    );
}

/**
 * @hidden
 */
export function tile2lat(y: number, level: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, level);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
