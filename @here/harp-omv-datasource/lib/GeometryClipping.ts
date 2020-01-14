/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2 } from "three";

const tmpBA = new Vector2();
const tmpQP = new Vector2();
const tmpPA = new Vector2();
const tmpA = new Vector2();
const tmpB = new Vector2();

/**
 * Clip the given polygon using the Sutherland-Hodgman algorithm.
 * @param polygon The polygon to clip
 * @param clip The clip shape
 * @return Clipped polygon
 */
export function clipPolygon(polygon: Vector2[], clip: Vector2[]): Vector2[] {
    let outputList = polygon;
    for (let e = 0; e < clip.length; ++e) {
        const p = clip[e];
        const q = clip[(e + 1) % clip.length];
        const inputList = outputList;
        outputList = [];
        for (let i = 0; i < inputList.length; ++i) {
            const currentPoint = inputList[i];
            const prevPoint = inputList[(i + inputList.length - 1) % inputList.length];
            if (inside(currentPoint, p, q)) {
                if (!inside(prevPoint, p, q)) {
                    outputList.push(computeIntersection(prevPoint, currentPoint, p, q));
                }
                outputList.push(currentPoint);
            } else if (inside(prevPoint, p, q)) {
                outputList.push(computeIntersection(prevPoint, currentPoint, p, q));
            }
        }
    }
    return outputList;
}

/**
 * Clip given polyline to a clip shape.
 * @param line The polyline to clip
 * @param clip The clip shape
 * @return New polyline that is clipped to the clip shape.
 */
export function clipPolyline(line: Vector2[], clip: Vector2[]): Vector2[] {
    const pointsInside = line.map(point => insideClipShape(point, clip));

    const outputList: Vector2[] = [];
    for (let i = 0, end = line.length - 1; i < end; ++i) {
        const currentPoint = line[i];
        const nextPoint = line[i + 1];
        const currentPointInside = pointsInside[i];
        const nextPointInside = pointsInside[i + 1];

        if (!currentPointInside && !nextPointInside) {
            const intersectionPoints = computeLineIntersectionsWithShape(
                currentPoint,
                nextPoint,
                clip
            );
            outputList.push(...intersectionPoints);
        } else if (currentPointInside && nextPointInside) {
            if (i === 0) {
                outputList.push(currentPoint);
            }
            outputList.push(nextPoint);
        } else {
            if (i === 0 && currentPointInside) {
                outputList.push(currentPoint);
            }
            const intersectionPoints = computeLineIntersectionsWithShape(
                currentPoint,
                nextPoint,
                clip
            );
            outputList.push(...intersectionPoints);
            if (nextPointInside) {
                outputList.push(nextPoint);
            }
        }
    }

    return outputList;
}

/**
 * Checks wether two lines intersect.
 * @param a Start point of first line
 * @param b End point of first line
 * @param p Start point of second line
 * @param q End point of second line
 * @return True if lines intersect
 */
function intersects(a: Vector2, b: Vector2, p: Vector2, q: Vector2): boolean {
    tmpBA.subVectors(b, a);
    tmpQP.subVectors(q, p);
    tmpPA.subVectors(p, a);
    const D = tmpBA.cross(tmpQP);
    const u = tmpPA.cross(tmpQP) / D;
    const v = tmpPA.cross(tmpBA) / D;

    if (D === 0.0) {
        return false;
    }

    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
        return false;
    }

    return true;
}

/**
 * Compute intersection point of two lines
 * @param a Start point of first line
 * @param b End point of first line
 * @param p Start point of second line
 * @param q End point of second line
 * @param result Output vector for the intersection point
 */
function computeIntersection(
    a: Vector2,
    b: Vector2,
    p: Vector2,
    q: Vector2,
    result = new Vector2()
): Vector2 {
    tmpBA.subVectors(b, a);
    tmpQP.subVectors(q, p);
    const c1 = a.cross(tmpBA);
    const c2 = p.cross(tmpQP);
    const D = tmpBA.cross(tmpQP);
    const x = (tmpBA.x * c2 - tmpQP.x * c1) / D;
    const y = (tmpBA.y * c2 - tmpQP.y * c1) / D;
    return result.set(x, y).round();
}

/**
 * Compute intersections points of a line with a clip shape.
 * @param a Start point of line
 * @param b End poin of line
 * @param clip The clip shape
 * @return A list of all intersections with the clip shape.
 */
function computeLineIntersectionsWithShape(a: Vector2, b: Vector2, clip: Vector2[]): Vector2[] {
    const result: Vector2[] = [];
    for (let e = 0; e < clip.length; ++e) {
        const p = clip[e];
        const q = clip[(e + 1) % clip.length];

        if (intersects(a, b, p, q)) {
            const intersectionPoint = computeIntersection(a, b, p, q);

            if (result.length === 0) {
                result.push(intersectionPoint);
            } else if (!result.some(point => point.equals(intersectionPoint))) {
                // Avoid duplicated intersections if edges are hit
                result.push(intersectionPoint);
            }
        }
    }

    // Keep order of points stable for more than two intersections
    if (result.length === 2) {
        tmpA.subVectors(a, b).normalize();
        tmpB.subVectors(result[0], result[1]).normalize();
        if (tmpA.dot(tmpB) < 0) {
            [result[0], result[1]] = [result[1], result[0]];
        }
    }

    return result;
}

/**
 * Compute if point is inside a side of the clip shape
 * @param point Point to test
 * @param p Start point of side
 * @param q End point of side
 */
function inside(point: Vector2, p: Vector2, q: Vector2) {
    tmpA.subVectors(q, p);
    tmpB.subVectors(point, p);
    return tmpA.cross(tmpB) > 0;
}

/**
 * Compute if a point is inside a clip shape
 * @param point Point to test
 * @param clip Clip shape
 * @return Returns true if point is inside clip shape
 */
function insideClipShape(point: Vector2, clip: Vector2[]): boolean {
    for (let e = 0; e < clip.length; ++e) {
        const p = clip[e];
        const q = clip[(e + 1) % clip.length];

        if (!inside(point, p, q)) {
            return false;
        }
    }

    return true;
}
