/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

export namespace Math2D {
    /**
     * Alternative 2D box object with less memory impact (four numbers instead of two min/max
     * objects with two numbers each). Should be faster.
     */
    export class Box {
        /**
         * Alternative 2D box object with less memory impact (four numbers instead of two min/max
         * objects with two numbers each). Should be faster.
         *
         * @param x New X value.
         * @param y New y value.
         * @param w New w value.
         * @param h New h value.
         */
        constructor(public x = 0, public y = 0, public w = 0, public h = 0) {}

        /**
         * Set new values to all properties of the box.
         *
         * @param x New X value.
         * @param y New y value.
         * @param w New w value.
         * @param h New h value.
         */
        set(x: number, y: number, w: number, h: number) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
        }

        /**
         * Test box for inclusion of point.
         *
         * @param x X coordinate of point.
         * @param y Y coordinate of point.
         */
        contains(x: number, y: number): boolean {
            return this.x <= x && this.x + this.w >= x && this.y <= y && this.y + this.h >= y;
        }

        /**
         * Test two boxes for intersection.
         *
         * @param other Box 2 to test for intersection.
         */
        intersects(other: Box): boolean {
            return (
                this.x <= other.x + other.w &&
                this.x + this.w >= other.x &&
                this.y <= other.y + other.h &&
                this.y + this.h >= other.y
            );
        }
    }

    /**
     * Box to store UV coordinates.
     */
    export interface UvBox {
        s0: number;
        t0: number;
        s1: number;
        t1: number;
    }

    /**
     * Compute squared distance between two 2D points `a` and `b`.
     *
     * @param ax Point a.x
     * @param ay Point a.y
     * @param bx Point b.x
     * @param by Point b.y
     * @returns Squared distance between the two points
     */
    export function distSquared(ax: number, ay: number, bx: number, by: number): number {
        return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
    }

    /**
     * Compute squared distance between a 2D point and a 2D line segment.
     *
     * @param px Test point X
     * @param py Test point y
     * @param l0x Line segment start X
     * @param l0y Line segment start Y
     * @param l1x Line segment end X
     * @param l1y Line segment end Y
     * @returns Squared distance between point and line segment
     */
    export function distToSegmentSquared(
        px: number,
        py: number,
        l0x: number,
        l0y: number,
        l1x: number,
        l1y: number
    ): number {
        const lineLengthSuared = distSquared(l0x, l0y, l1x, l1y);
        if (lineLengthSuared === 0) {
            return distSquared(px, py, l0x, l0y);
        }
        let t = ((px - l0x) * (l1x - l0x) + (py - l0y) * (l1y - l0y)) / lineLengthSuared;
        t = Math.max(0, Math.min(1, t));
        return distSquared(px, py, l0x + t * (l1x - l0x), l0y + t * (l1y - l0y));
    }
}
