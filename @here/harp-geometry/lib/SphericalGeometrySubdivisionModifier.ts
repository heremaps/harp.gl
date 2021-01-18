/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Projection, sphereProjection } from "@here/harp-geoutils";
import { Vector3 } from "three";

import { SubdivisionModifier } from "./SubdivisionModifier";

const VERTEX_POSITION_CACHE = [new Vector3(), new Vector3(), new Vector3()];

/**
 * The [[SphericalGeometrySubdivisionModifier]] subdivides triangle mesh geometries positioned
 * on the surface of a sphere centered at `(0, 0, 0)`.
 */
export class SphericalGeometrySubdivisionModifier extends SubdivisionModifier {
    /**
     * Constructs a new [[SphericalGeometrySubdivisionModifier]].
     *
     * @param angle - The maximum angle in radians between two vertices and the origin.
     * @param projection - The projection that defines the world space of this geometry.
     */
    constructor(readonly angle: number, readonly projection: Projection = sphereProjection) {
        super();
    }

    /** @override */
    protected shouldSplitTriangle(a: Vector3, b: Vector3, c: Vector3): number | undefined {
        const aa = sphereProjection.reprojectPoint(this.projection, a, VERTEX_POSITION_CACHE[0]);
        const bb = sphereProjection.reprojectPoint(this.projection, b, VERTEX_POSITION_CACHE[1]);
        const cc = sphereProjection.reprojectPoint(this.projection, c, VERTEX_POSITION_CACHE[2]);

        const alpha = aa.angleTo(bb);
        const beta = bb.angleTo(cc);
        const gamma = cc.angleTo(aa);

        // find the maximum angle
        const m = Math.max(alpha, Math.max(beta, gamma));

        // split the triangle if needed.
        if (m < this.angle) {
            return undefined;
        }

        if (m === alpha) {
            return 0;
        } else if (m === beta) {
            return 1;
        } else if (m === gamma) {
            return 2;
        }

        throw new Error("failed to split triangle");
    }
}
