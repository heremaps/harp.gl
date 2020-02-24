/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2 } from "three";

const tmpBA = new Vector2();
const tmpQP = new Vector2();
const tmpA = new Vector2();
const tmpB = new Vector2();

/**
 * Clip the given polygon using the Sutherland-Hodgman algorithm.
 */
export function clipPolygon(polygon: Vector2[], clip: Vector2[]): Vector2[] {
    if (polygon.length === 0) {
        return polygon;
    }
    if (!polygon[0].equals(polygon[polygon.length - 1])) {
        // close the polygon if needed.
        polygon = [...polygon, polygon[0]];
    }
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

function inside(point: Vector2, p: Vector2, q: Vector2) {
    tmpA.subVectors(q, p);
    tmpB.subVectors(point, p);
    return tmpA.cross(tmpB) > 0;
}
