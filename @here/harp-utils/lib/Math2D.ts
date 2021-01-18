/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

interface Vec2Like {
    x: number;
    y: number;
}

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
         * @param x - New X value.
         * @param y - New y value.
         * @param w - New w value.
         * @param h - New h value.
         */
        constructor(public x = 0, public y = 0, public w = 0, public h = 0) {}

        /**
         * Set new values to all properties of the box.
         *
         * @param x - New X value.
         * @param y - New y value.
         * @param w - New w value.
         * @param h - New h value.
         */
        set(x: number, y: number, w: number, h: number) {
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
        }

        /**
         * Copy values from another box.
         *
         * @param box - Another box.
         */
        copy(box: Box) {
            this.x = box.x;
            this.y = box.y;
            this.w = box.w;
            this.h = box.h;
        }

        /**
         * Test box for inclusion of point.
         *
         * @param x - X coordinate of point.
         * @param y - Y coordinate of point.
         */
        contains(x: number, y: number): boolean {
            return this.x <= x && this.x + this.w >= x && this.y <= y && this.y + this.h >= y;
        }

        /**
         * Test box for inclusion of another box.
         *
         * @param other - Box 2 to test for inclusion.
         */
        containsBox(other: Box): boolean {
            const xmax = other.x + other.w;
            const ymax = other.y + other.h;
            return (
                this.contains(other.x, other.y) &&
                this.contains(xmax, other.y) &&
                this.contains(other.x, ymax) &&
                this.contains(xmax, ymax)
            );
        }

        /**
         * Test two boxes for intersection.
         *
         * @param other - Box 2 to test for intersection.
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
     * @param ax - Point a.x
     * @param ay - Point a.y
     * @param bx - Point b.x
     * @param by - Point b.y
     * @returns Squared distance between the two points
     */
    export function distSquared(ax: number, ay: number, bx: number, by: number): number {
        return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
    }

    /**
     * Computes the squared length of a line.
     *
     * @param line - An array of that forms a line via [x,y,z,x,y,z,...] tuples.
     */
    export function computeSquaredLineLength(line: number[]): number {
        let squaredLineLength: number = 0;

        const length = line.length - 4;
        for (let i = 0; i < length; i += 3) {
            const xDiff = line[i + 3] - line[i];
            const yDiff = line[i + 4] - line[i + 1];
            squaredLineLength += xDiff * xDiff + yDiff * yDiff;
        }
        return squaredLineLength;
    }

    /**
     * Compute squared distance between a 2D point and a 2D line segment.
     *
     * @param px - Test point X
     * @param py - Test point y
     * @param l0x - Line segment start X
     * @param l0y - Line segment start Y
     * @param l1x - Line segment end X
     * @param l1y - Line segment end Y
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

    /**
     * Finds the intersections of a line and a circle.
     *
     * @param xLine1 - abscissa of first line point.
     * @param yLine1 - ordinate of second line point.
     * @param xLine2 - abscissa of second line point.
     * @param yLine2 - ordinate of second line point.
     * @param radius - circle radius.
     * @param xCenter - abscissa of circle center.
     * @param yCenter - ordinate of circle center.
     * @returns coordinates of the intersections (1 if the line is tangent to the circle, 2
     * if it's secant) or undefined if there's no intersection.
     */
    export function intersectLineAndCircle(
        xLine1: number,
        yLine1: number,
        xLine2: number,
        yLine2: number,
        radius: number,
        xCenter: number = 0,
        yCenter: number = 0
    ): { x1: number; y1: number; x2?: number; y2?: number } | undefined {
        // Line equation: dy*x - dx*y = c, c = dy*x1 - dx*y1 = x1*y2 - x2*y1
        // Circle equation: (x-xCenter)^2 + (y-yCenter)^2 = r^2

        // 1. Translate circle center to origin of coordinates:
        // u = x - xCenter
        // v = y - yCenter
        // circle: u^2 + v^2 = r^2
        // line: dy*u - dx*v = cp, cp = c - dy*xCenter - dx*yCenter

        // 2. Intersections are solutions of a quadratic equation:
        // ui = (cp*dy +/- sign(dy)*dx*discriminant / dSq
        // vi = (-cp*dx +/- |dy|*discriminant / dSq
        // discriminant = r^2*dSq - cp^2, dSq = dx^2 + dy^2
        // The sign of the discriminant indicates the number of intersections.

        // 3. Translate intersection coordinates back to original space:
        // xi = xCenter + ui
        // yi = yCenter + yi

        const epsilon = 1e-10;
        const dx = xLine2 - xLine1;
        const dy = yLine2 - yLine1;
        const dSq = dx * dx + dy * dy;
        const rSq = radius * radius;
        const c = xLine1 * yLine2 - xLine2 * yLine1;
        const cp = c - dy * xCenter + dx * yCenter;
        const discriminantSquared = rSq * dSq - cp * cp;

        if (discriminantSquared < -epsilon) {
            // no intersection
            return undefined;
        }

        const xMid = cp * dy;
        const yMid = -cp * dx;

        if (discriminantSquared < epsilon) {
            // 1 intersection (tangent line)
            return { x1: xCenter + xMid / dSq, y1: yCenter + yMid / dSq };
        }

        const discriminant = Math.sqrt(discriminantSquared);

        // 2 intersections (secant line)
        const signDy = dy < 0 ? -1 : 1;
        const absDy = Math.abs(dy);

        const xDist = signDy * dx * discriminant;
        const yDist = absDy * discriminant;

        return {
            x1: xCenter + (xMid + xDist) / dSq,
            y1: yCenter + (yMid + yDist) / dSq,
            x2: xCenter + (xMid - xDist) / dSq,
            y2: yCenter + (yMid - yDist) / dSq
        };
    }

    /**
     * Computes the intersection point between two lines.
     *
     * @remarks
     * This functions computes the
     * {@link https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
     *    | line-line intersection} of two lines given two points on each line.
     *
     * @param x1 - x coordinate of the first point of the first line.
     * @param y1 - y coordinate of the first point of the first line.
     * @param x2 - x coordinate of the second point of the first line.
     * @param y2 - y coordinate of the second point of the first line.
     * @param x3 - x coordinate of the first point of the second line.
     * @param y3 - y coordinate of the first point of the second line.
     * @param x4 - x coordinate of the second point of the second line.
     * @param y4 - y coordinate of the second point of the second line.
     * @param result - The resulting point.
     */
    export function intersectLines(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        x3: number,
        y3: number,
        x4: number,
        y4: number,
        result: Vec2Like = { x: 0, y: 0 }
    ): Vec2Like | undefined {
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (d === 0) {
            return undefined;
        }
        const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
        const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
        result.x = px;
        result.y = py;
        return result;
    }
}
