/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShapeUtils, Vector2 } from "three";

/**
 * A class representing a ring of a polygon geometry.
 */
export class Ring {
    /**
     * The area of this `Ring`.
     */
    readonly area: number;

    /**
     * The winding of this `Ring`.
     */
    readonly winding: boolean;

    /**
     * The vertex stride.
     */
    readonly vertexStride: number;

    constructor(
        readonly points: Vector2[],
        readonly textureCoords?: Vector2[],
        readonly extents: number = 4 * 1024
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
     * the vertex at `index+1` should be connected by an outline
     * when stroking the polygon.
     *
     * @param index The index of the first vertex of the outline edge.
     */
    isOutline(index: number): boolean {
        const extents = this.extents;
        const nextIdx = (index + 1) % this.points.length;
        const curr = this.points[index];
        const next = this.points[nextIdx];

        return !(
            (curr.x <= 0 && next.x <= 0) ||
            (curr.x >= extents && next.x >= extents) ||
            (curr.y <= 0 && next.y <= 0) ||
            (curr.y >= extents && next.y >= extents)
        );
    }
}
