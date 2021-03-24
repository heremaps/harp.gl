/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClippedVertex } from "@here/harp-geometry/lib/ClipPolygon";
import { ShapeUtils, Vector2 } from "three";

/**
 * A class representing a ring of a polygon geometry.
 */
export class Ring {
    /**
     * The signed area of this `Ring`.
     *
     * @remarks
     * The sign of the area depends on the projection and the axis orientation
     * of the ring coordinates.
     * For example, given a ring with `CW winding`: `area > 0` with Y-axis that grows downwards and `area < 0` otherwise.
     */
    readonly area: number;

    /**
     * The winding of this `Ring`.
     *
     * @remarks
     * Derived from the sign of the `area` of this Ring.
     */
    readonly winding: boolean;

    /**
     * The vertex stride.
     */
    readonly vertexStride: number;

    /**
     * Creates a new `Ring`.
     *
     * @param points The coordinates of the rings.
     * @param textureCoords The optional `Array` of texture coordinates.
     * @param extents The extents of the tile bounds.
     * @param hasClipInfo A flag indicating that vertices of this `Ring` may be clipped.
     */
    constructor(
        readonly points: Vector2[],
        readonly textureCoords?: Vector2[],
        readonly extents: number = 4 * 1024,
        readonly hasClipInfo: boolean = false
    ) {
        if (textureCoords !== undefined && textureCoords.length !== points.length) {
            throw new Error(
                `the array of texture coordinates must have the same number of elements of the array of points`
            );
        }

        this.vertexStride = 2;

        if (textureCoords !== undefined) {
            this.vertexStride = this.vertexStride + 2;
        }

        this.area = ShapeUtils.area(this.points);
        this.winding = this.area < 0;
    }

    /**
     * Returns a flattened `Array` containing the position and texture coordinates of this `Ring`.
     *
     * @param array The target `Array`.
     * @param offset Optional offset into the array.
     */
    toArray(array: number[] = [], offset: number = 0): number[] {
        this.points.forEach((p, i) => p.toArray(array, offset + this.vertexStride * i));
        this.textureCoords?.forEach((p, i) => p.toArray(array, offset + this.vertexStride * i + 2));
        return array;
    }

    /**
     * Tests if the edge connecting the vertex at `index` with
     * the vertex at `index+1` should be connected by a line
     * when stroking the polygon.
     *
     * @param index The index of the first vertex of the outline edge.
     */
    isProperEdge(index: number): boolean {
        const extents = this.extents;
        const nextIdx = (index + 1) % this.points.length;
        const curr: ClippedVertex = this.points[index];
        const next: ClippedVertex = this.points[nextIdx];

        if (this.hasClipInfo) {
            if (curr.x !== next.x && curr.y !== next.y) {
                // `curr` and `next` must be connected with a line
                // because they don't form a vertical or horizontal lines.
                return true;
            }

            const currAtEdge = curr.x % this.extents === 0 || curr.y % this.extents === 0;

            if (!currAtEdge) {
                // the points are connected with a line
                // because at least one of the points is not on
                // the tile boundary.
                return true;
            }

            const nextAtEdge = next.x % this.extents === 0 || next.y % this.extents === 0;

            if (!nextAtEdge) {
                // the points are connected with a line
                // because at least one of the points is not on
                // the tile boundary.
                return true;
            }

            const currWasClipped = curr.isClipped === true;
            const nextWasClipped = next.isClipped === true;

            return !currWasClipped && !nextWasClipped;
        }

        return !(
            (curr.x <= 0 && next.x <= 0) ||
            (curr.x >= extents && next.x >= extents) ||
            (curr.y <= 0 && next.y <= 0) ||
            (curr.y >= extents && next.y >= extents)
        );
    }
}
