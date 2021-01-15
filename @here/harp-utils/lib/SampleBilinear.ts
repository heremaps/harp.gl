/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

type TypedArray =
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Uint8ClampedArray
    | Float32Array
    | Float64Array;

/**
 * Returns a bilinear-interpolated texture sample for a given texture.
 * @param texture - Two-dimensional texture to sample.
 * @param width - Texture width.
 * @param height - Texture height.
 * @param u - Number between 0 and 1 representing the location to sample in the width dimension.
 * @param v - Number between 0 and 1 representing the location to sample in the height dimension.
 */
export function sampleBilinear(
    texture: TypedArray,
    width: number,
    height: number,
    u: number,
    v: number
): number {
    const maxXIndex = width - 1;
    const maxYIndex = height - 1;
    // Compute the x and y coordinates relative to the mesh size.
    const xIndex = u * maxXIndex;
    const xIndexFloor = Math.floor(xIndex);
    const yIndex = v * maxYIndex;
    const yIndexFloor = Math.floor(yIndex);
    const swIndex = yIndexFloor * width + xIndexFloor;
    const seIndex = xIndexFloor < maxXIndex ? swIndex + 1 : swIndex;
    const nwIndex = yIndexFloor < maxYIndex ? swIndex + width : swIndex;
    const neIndex = xIndexFloor < maxXIndex ? nwIndex + 1 : nwIndex;
    const swElevation = texture[swIndex];
    const seElevation = texture[seIndex];
    const nwElevation = texture[nwIndex];
    const neElevation = texture[neIndex];
    // Get the fractional components to do bilinear interpolation.
    const xFrac = Number.isInteger(xIndex) ? 0 : xIndex - xIndexFloor;
    const xFracInverse = 1 - xFrac;
    const yFrac = Number.isInteger(yIndex) ? 0 : yIndex - yIndexFloor;
    const yFracInverse = 1 - yFrac;
    // The interpolation is the sum of the four closest neighbours each
    // multiplied by the diagonal areas.
    const result =
        swElevation * xFracInverse * yFracInverse +
        seElevation * xFrac * yFracInverse +
        nwElevation * xFracInverse * yFrac +
        neElevation * xFrac * yFrac;
    return result;
}
