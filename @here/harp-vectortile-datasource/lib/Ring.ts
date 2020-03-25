/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export class Ring {
    readonly winding: boolean;
    /**
     * Constructs a new [[Ring]].
     *
     * @param extents The extents of the enclosing layer.
     * @param vertexStride The stride of this elements stored in 'contour'.
     * @param contour The [[Array]] containing the projected world coordinates.
     */
    constructor(
        readonly extents: number,
        readonly vertexStride: number,
        readonly contour: number[]
    ) {
        this.winding = this.area() < 0;
    }

    area(): number {
        const points = this.contour;
        const stride = this.vertexStride;
        const n = points.length / stride;
        let area = 0.0;
        for (let p = n - 1, q = 0; q < n; p = q++) {
            area +=
                points[p * stride] * points[q * stride + 1] -
                points[q * stride] * points[p * stride + 1];
        }
        return area / 2;
    }
}
