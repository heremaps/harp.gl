export namespace MathUtils {
    /**
     * Ensures that input value fits in a given range.
     *
     * @param value The value to be clamped.
     * @param min Minimum value.
     * @param max Maximum value.
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
     * @param edge0
     * @param edge1
     * @param x
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
     * @param edge0
     * @param edge1
     * @param x
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
     * @param val The incoming value to be converted.
     * @param inMin Lower bound of the value's current range.
     * @param inMax Upper bound of the value's current range.
     * @param outMin Lower bound of the value's target range.
     * @param outMax Upper bound of the value's target range.
     */
    export function lerp(
        val: number,
        inMin: number,
        inMax: number,
        outMin: number,
        outMax: number
    ) {
        return ((val - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }
}
