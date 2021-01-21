/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export namespace MathUtils {
    /**
     * Ensures that input value fits in a given range.
     *
     * @param value - The value to be clamped.
     * @param min - Minimum value.
     * @param max - Maximum value.
     *
     * @returns Clamped value.
     */
    export function clamp(value: number, min: number, max: number): number {
        return value < min ? min : value > max ? max : value;
    }

    /**
     * Returns a smooth interpolation between the values edge0 and edge1 based on the interpolation
     * factor x. `0 <= x <= 1`.
     * @see https://en.wikipedia.org/wiki/Smoothstep
     *
     * @param edge0 -
     * @param edge1 -
     * @param x -
     */
    export function smoothStep(edge0: number, edge1: number, x: number) {
        // Scale, bias and saturate x to 0..1 range
        x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        // Evaluate polynomial
        return x * x * (3 - 2 * x);
    }

    /**
     * Returns a smooth interpolation between the values edge0 and edge1 based on the interpolation
     * factor x. `0 <= x <= 1`.
     *
     * Improved version by Ken Perlin, which has zero 1st- and 2nd-order derivatives at `x = 0` and
     * `x = 1`:
     *
     * @see https://en.wikipedia.org/wiki/Smoothstep
     *
     * @param edge0 -
     * @param edge1 -
     * @param x -
     */
    export function smootherStep(edge0: number, edge1: number, x: number) {
        // Scale, and clamp x to 0..1 range
        x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        // Evaluate polynomial
        return x * x * x * (x * (x * 6 - 15) + 10);
    }

    /**
     * Maps a number from one range to another.
     *
     * @param val - The incoming value to be converted.
     * @param inMin - Lower bound of the value's current range.
     * @param inMax - Upper bound of the value's current range.
     * @param outMin - Lower bound of the value's target range.
     * @param outMax - Upper bound of the value's target range.
     */
    export function map(val: number, inMin: number, inMax: number, outMin: number, outMax: number) {
        return ((val - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }

    /**
     * Returns the smaller of the two given numbers. Both numbers may be undefined, in which case
     * the result is undefined. If only one of the numbers is undefined, the other number is
     * returned.
     *
     * @param a - First number.
     * @param b - Second number.
     */
    export function min2(a: number | undefined, b: number | undefined): number | undefined {
        let result: number | undefined;

        if (a !== undefined) {
            result = a;
        }
        if (b !== undefined) {
            result = result === undefined ? b : Math.min(result, b);
        }

        return result;
    }

    /**
     * Returns the larger of the two given numbers. Both numbers may be undefined, in which case
     * the result is undefined. If only one of the numbers is undefined, the other number is
     * returned.
     *
     * @param a - First number.
     * @param b - Second number.
     */
    export function max2(a: number | undefined, b: number | undefined): number | undefined {
        let result: number | undefined;

        if (a !== undefined) {
            result = a;
        }
        if (b !== undefined) {
            result = result === undefined ? b : Math.max(result, b);
        }

        return result;
    }

    /**
     * Checks if the value of a given number is inside an upper or lower bound. The bounds may be
     * undefined, in which case their value is ignored.
     *
     * @param value - Value to check.
     * @param lowerBound - The lower bound to check the value against.
     * @param upperBound - The upper bound to check the value against.
     *
     * @returns `true` if value is inside the bounds or if the bounds are `undefined`, `false`
     *          otherwise.
     */
    export function isClamped(
        value: number,
        lowerBound: number | undefined,
        upperBound: number | undefined
    ): boolean {
        if (lowerBound !== undefined && value < lowerBound) {
            return false;
        }
        if (upperBound !== undefined && value > upperBound) {
            return false;
        }
        return true;
    }

    /**
     * Smoothly interpolates between two values using cubic formula
     *
     * @param startValue -
     * @param endValue -
     * @param time -
     * @returns Result of the interpolation within the range of `[startValue, endValue]`
     */
    export function easeInOutCubic(startValue: number, endValue: number, time: number): number {
        const timeValue =
            time < 0.5 ? 4 * time * time * time : (time - 1) * (2 * time - 2) * (2 * time - 2) + 1;
        return startValue + (endValue - startValue) * timeValue;
    }
}
