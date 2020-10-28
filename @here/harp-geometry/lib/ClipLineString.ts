/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Math2D } from "@here/harp-utils";
import { Vector2 } from "three";

/**
 * A clipping edge.
 *
 * @remarks
 * Clip lines using the Sutherland-Hodgman algorithm.
 *
 * @internal
 */
class ClipEdge {
    readonly p0: Vector2;
    readonly p1: Vector2;

    /**
     * Creates a clipping edge.
     *
     * @param x1 - The x coordinate of the first point of this ClipEdge.
     * @param y1 - The y coordinate of the first point of this ClipEdge.
     * @param x2 - The x coordinate of the second point of this ClipEdge.
     * @param y2 - The y coordinate of the second point of this ClipEdge.
     * @param isInside - The function used to test points against this ClipEdge.
     */
    constructor(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        private readonly isInside: (p: Vector2) => boolean
    ) {
        this.p0 = new Vector2(x1, y1);
        this.p1 = new Vector2(x2, y2);
    }

    /**
     * Tests if the given point is inside this clipping edge.
     */
    inside(point: Vector2): boolean {
        return this.isInside(point);
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * {@link https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
     *    | line-line intersection}.
     */
    computeIntersection(a: Vector2, b: Vector2): Vector2 {
        const result = new Vector2();
        Math2D.intersectLines(
            a.x,
            a.y,
            b.x,
            b.y,
            this.p0.x,
            this.p0.y,
            this.p1.x,
            this.p1.y,
            result
        );
        return result;
    }

    /**
     * Clip the input line against this edge.
     */
    clipLine(lineString: Vector2[]): Vector2[][] {
        const inputList = lineString;

        const result: Vector2[][] = [];

        lineString = [];
        result.push(lineString);

        const pushPoint = (point: Vector2) => {
            if (lineString.length === 0 || !lineString[lineString.length - 1].equals(point)) {
                lineString.push(point);
            }
        };

        for (let i = 0; i < inputList.length; ++i) {
            const currentPoint = inputList[i];
            const prevPoint = i > 0 ? inputList[i - 1] : undefined;

            if (this.inside(currentPoint)) {
                if (prevPoint !== undefined && !this.inside(prevPoint)) {
                    if (lineString.length > 0) {
                        lineString = [];
                        result.push(lineString);
                    }
                    pushPoint(this.computeIntersection(prevPoint, currentPoint));
                }
                pushPoint(currentPoint);
            } else if (prevPoint !== undefined && this.inside(prevPoint)) {
                pushPoint(this.computeIntersection(prevPoint, currentPoint));
            }
        }

        if (result[result.length - 1].length === 0) {
            result.length = result.length - 1;
        }

        return result;
    }

    /**
     * Clip the input lines against this edge.
     */
    clipLines(lineStrings: Vector2[][]) {
        const reuslt: Vector2[][] = [];
        lineStrings.forEach(lineString => {
            this.clipLine(lineString).forEach(clippedLine => {
                reuslt.push(clippedLine);
            });
        });
        return reuslt;
    }
}

/**
 * Clip the input line against the given bounds.
 *
 * @param lineString - The line to clip.
 * @param minX - The minimum x coordinate.
 * @param minY - The minimum y coordinate.
 * @param maxX - The maxumum x coordinate.
 * @param maxY - The maxumum y coordinate.
 */
export function clipLineString(
    lineString: Vector2[],
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
): Vector2[][] {
    const clipEdge0 = new ClipEdge(minX, minY, minX, maxY, p => p.x > minX); // left
    const clipEdge1 = new ClipEdge(minX, maxY, maxX, maxY, p => p.y < maxY); // bottom
    const clipEdge2 = new ClipEdge(maxX, maxY, maxX, minY, p => p.x < maxX); // right
    const clipEdge3 = new ClipEdge(maxX, minY, minX, minY, p => p.y > minY); // top

    let lines = clipEdge0.clipLine(lineString);
    lines = clipEdge1.clipLines(lines);
    lines = clipEdge2.clipLines(lines);
    lines = clipEdge3.clipLines(lines);

    return lines;
}
