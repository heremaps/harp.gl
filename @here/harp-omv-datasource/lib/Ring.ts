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

    private m_contour?: number[];

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
     * Returns a flattened `Array` containing the position and texture coordinates of this `Ring`.
     */
    get contour(): number[] {
        if (this.m_contour === undefined) {
            this.m_contour = this.toArray();
        }
        return this.m_contour;
    }
}
