/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector2 } from "three";

interface ClipInfo {
    /**
     * `true` if this vertex was clipped.
     */
    isClipped?: boolean;
}

export type ClippedVertex = Vector2 & ClipInfo;

/**
 * Abstract helper class used to implement the Sutherland-Hodgman clipping algorithm.
 *
 * @remarks
 * Concrete implementation of this class are used to clip a polygon
 * against one edge of a bounding box.
 *
 * @internal
 */
export abstract class ClippingEdge {
    /**
     * Tests if the given point is inside this clipping edge.
     *
     * @param point A point of the polygon.
     * @param extent The extent of the bounding box.
     */
    abstract inside(point: Vector2, extent: number): boolean;

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * Specialization of {@link https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
     *    | line-line intersection}.
     *
     * @param a A point of the segment to clip.
     * @param b A point of the segment to clip.
     * @param extent The extent of the bounding box.
     */
    abstract computeIntersection(a: Vector2, b: Vector2, extent: number): ClippedVertex;

    /**
     * Clip the polygon against this clipping edge.
     *
     * @param polygon Clip the polygon against this edge.
     * @param extent The extent of the bounding box.
     *
     * @return The clipped polygon.
     */
    clipPolygon(polygon: Vector2[], extent: number): Vector2[] {
        const inputList = polygon;

        polygon = [];

        const pushPoint = (point: ClippedVertex) => {
            const lastAddedPoint: ClippedVertex = polygon[polygon.length - 1];

            if (
                !lastAddedPoint?.equals(point) ||
                (point.isClipped === true && !lastAddedPoint?.isClipped) ||
                (!point.isClipped && lastAddedPoint?.isClipped === true)
            ) {
                polygon.push(point);
            }
        };

        for (let i = 0; i < inputList.length; ++i) {
            const currentPoint = inputList[i];
            const prevPoint = inputList[(i + inputList.length - 1) % inputList.length];
            if (this.inside(currentPoint, extent)) {
                if (!this.inside(prevPoint, extent)) {
                    const p = this.computeIntersection(prevPoint, currentPoint, extent);
                    p.isClipped = true;
                    pushPoint(p);
                }
                pushPoint(currentPoint);
            } else if (this.inside(prevPoint, extent)) {
                const p = this.computeIntersection(prevPoint, currentPoint, extent);
                p.isClipped = true;
                pushPoint(p);
            }
        }

        return polygon;
    }
}

class TopClippingEdge extends ClippingEdge {
    /** @override */
    inside(point: Vector2): boolean {
        return point.y >= 0;
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * Find the intersection point between the line defined by the points `a` and `b`
     * and the edge defined by the points `(0, 0)` and `(0, extent)`.
     *
     * @override
     *
     */
    computeIntersection(a: Vector2, b: Vector2): Vector2 {
        const { x: x1, y: y1 } = a;
        const { x: x2, y: y2 } = b;
        const v: Vector2 = new Vector2((x1 * y2 - y1 * x2) / -(y1 - y2), 0).round();
        return v;
    }
}

class RightClippingEdge extends ClippingEdge {
    /**
     * @override
     *
     * See: HARP-14633, this should potentially be changed to < as it was previously.
     * However further investigation is needed to confirm this.
     */
    inside(point: Vector2, extent: number): boolean {
        return point.x <= extent;
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * Find the intersection point between the line defined by the points `a` and `b`
     * and the edge defined by the points `(extent, 0)` and `(extent, extent)`.
     *
     * @override
     *
     */
    computeIntersection(a: Vector2, b: Vector2, extent: number): Vector2 {
        const { x: x1, y: y1 } = a;
        const { x: x2, y: y2 } = b;
        const v: Vector2 = new Vector2(
            extent,
            (x1 * y2 - y1 * x2 - (y1 - y2) * -extent) / (x1 - x2)
        ).round();
        return v;
    }
}

class BottomClipEdge extends ClippingEdge {
    /** @override */
    inside(point: Vector2, extent: number): boolean {
        return point.y <= extent;
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * Find the intersection point between the line defined by the points `a` and `b`
     * and the edge defined by the points `(extent, extent)` and `(0, extent)`.
     *
     * @override
     *
     */
    computeIntersection(a: Vector2, b: Vector2, extent: number): Vector2 {
        const { x: x1, y: y1 } = a;
        const { x: x2, y: y2 } = b;
        const v: Vector2 = new Vector2(
            (x1 * y2 - y1 * x2 - (x1 - x2) * extent) / -(y1 - y2),
            extent
        ).round();
        return v;
    }
}

class LeftClippingEdge extends ClippingEdge {
    /** @override */
    inside(point: Vector2) {
        return point.x >= 0;
    }

    /**
     * Computes the intersection of a line and this clipping edge.
     *
     * @remarks
     * Find the intersection point between the line defined by the points `a` and `b`
     * and the edge defined by the points `(0, extent)` and `(0, 0)`.
     *
     * @override
     *
     */
    computeIntersection(a: Vector2, b: Vector2): Vector2 {
        const { x: x1, y: y1 } = a;
        const { x: x2, y: y2 } = b;
        const v: Vector2 = new Vector2(0, (x1 * y2 - y1 * x2) / (x1 - x2)).round();
        return v;
    }
}

const clipEdges = [
    new TopClippingEdge(),
    new RightClippingEdge(),
    new BottomClipEdge(),
    new LeftClippingEdge()
];

/**
 * Clip the given polygon against a rectangle using the Sutherland-Hodgman algorithm.
 *
 * @remarks
 * The coordinates of the polygon must be integer numbers.
 *
 * @param polygon The vertices of the polygon to clip.
 * @param extent The extents of the rectangle to clip against.
 */
export function clipPolygon(polygon: Vector2[], extent: number): Vector2[] {
    if (polygon.length === 0) {
        return polygon;
    }

    if (!polygon[0].equals(polygon[polygon.length - 1])) {
        // close the polygon if needed.
        polygon = [...polygon, polygon[0]];
    }

    for (const clip of clipEdges) {
        polygon = clip.clipPolygon(polygon, extent);
    }

    if (polygon.length < 3) {
        return [];
    }

    return polygon;
}
