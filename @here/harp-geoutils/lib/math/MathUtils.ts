/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box3Like } from "./Box3Like";
import { Vector3Like } from "./Vector3Like";

import * as THREE from "three";

export namespace MathUtils {
    /**
     * Creates a new empty bounding box.
     * @deprecated
     */
    export function newEmptyBox3(): Box3Like {
        return {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };
    }

    /**
     * Creates a new [Vector3Like] instance.
     *
     * @param x The x component.
     * @param y The y component.
     * @param z The z component.
     */
    export function newVector3(x: number, y: number, z: number): Vector3Like;

    /**
     * Creates a new [Vector3Like] instance.
     *
     * @param x The x component.
     * @param y The y component.
     * @param z The z component.
     * @param v The resulting [Vector3Like] instance.
     */
    export function newVector3<Vector extends Vector3Like>(
        x: number,
        y: number,
        z: number,
        v: Vector
    ): Vector;

    /**
     * Set the components of the given [Vector3Like] instance.
     *
     * @param x The x component.
     * @param y The y component.
     * @param z The z component.
     * @param v The [Vector3Like]
     */
    export function newVector3(x: number, y: number, z: number, v?: Vector3Like): Vector3Like {
        if (v === undefined) {
            return { x, y, z };
        }
        v.x = x;
        v.y = y;
        v.z = z;
        return v;
    }

    /**
     * Converts an angle measured in degrees to an equivalent value in radians.
     *
     * @param degrees Value in degrees.
     * @returns Value in radians.
     * @deprecated use THREE.MathUtils.degToRad instead
     */
    export const degToRad = THREE.MathUtils.degToRad;

    /**
     * Converts an angle measured in radians to an equivalent value in degrees.
     *
     * @param degrees Value in radians.
     * @returns Value in degrees.
     * @deprecated
     */
    export const radToDeg = THREE.MathUtils.radToDeg;

    /**
     * Ensures that input value fits in a given range.
     *
     * @param value The value to be clamped.
     * @param min Minimum value.
     * @param max Maximum value.
     * @returns Clamped value.
     * @deprecated
     */
    export const clamp = THREE.MathUtils.clamp;

    /**
     * Normalize angle in degrees to range `[0, 360)`.
     *
     * @param a Angle in degrees.
     * @returns Angle in degrees in range `[0, 360)`.
     */
    export function normalizeAngleDeg(a: number): number {
        a = a % 360;
        if (a < 0) {
            a = a + 360;
        }
        return a;
    }

    /**
     * Return the minimal delta between angles `a` and `b` given in degrees.
     *
     * Equivalent to `a - b` in coordinate space with exception vector direction can be reversed
     * that if `abs(a-b) > 180` because trip is shorter in 'other' direction.
     *
     * Useful when interpolating between `b` and `a` in angle space.
     *
     * @param a Start angle in degrees.
     * @param b End angle in degrees.
     * @returns Angle that that satisfies condition `a - b - d = 0` in angle space.
     */
    export function angleDistanceDeg(a: number, b: number): number {
        a = normalizeAngleDeg(a);
        b = normalizeAngleDeg(b);

        const d = a - b;
        if (d > 180) {
            return d - 360;
        } else if (d <= -180) {
            return d + 360;
        } else {
            return d;
        }
    }

    /**
     * Interpolate linearly between two angles given in degrees.
     *
     * @param p0 Angle from in degrees
     * @param p1 Angle to in degrees
     * @param t Interpolation factor (alpha), in range `0-1`.
     */
    export function interpolateAnglesDeg(p0: number, p1: number, t: number): number {
        // hand crafted version,
        // see stack for maybe better versions:
        //    https://stackoverflow.com/questions/2708476/rotation-interpolation

        const d = angleDistanceDeg(p1, p0);
        const r = (p0 + d * t) % 360;
        return r;
    }
}
