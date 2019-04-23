/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Face3, Geometry, Vector3 } from "three";

/**
 * The [[SphericalGeometrySubdivisionModifier]] subdivides triangle mesh geometries positioned
 * on the surface of a sphere centered at `(0, 0, 0)`.
 */
export class SphericalGeometrySubdivisionModifier {
    /**
     * Constructs a new [[SphericalGeometrySubdivisionModifier]].
     *
     * @param angle The maximum angle in radians between two vertices and the origin.
     */
    constructor(readonly angle: number) {}

    /**
     * Subdivides the faces of the given [[THREE.Geometry]].
     *
     * This method modifies (in-place) the vertices and the faces of the geometry.
     * Please note that only the vertex position attribute is changed
     * by this modifier. Normals, UVs, and vertex colors are left unmodified.
     *
     * @param geometry The [[THREE.Geometry]] to subdivide.
     */
    modify(geometry: Geometry): Geometry {
        const { vertices, faces } = geometry;

        // A cache containing the indices of the vertices added
        // when subdiving the faces of the geometry.
        const cache = new Map<string, number>();

        /**
         * Returns the index of the vertex positioned in the middle
         * of the given vertices.
         */
        function middleVertex(i: number, j: number): number {
            // build a unique `key` for the pair of indices `(i, j)`.
            const key = `${Math.min(i, j)}_${Math.max(i, j)}`;

            const h = cache.get(key);

            if (h !== undefined) {
                // nothing to do, a vertex in the middle of (i, j) was already created.
                return h;
            }

            // the position of the new vertex.
            const p = new Vector3();
            p.addVectors(vertices[i], vertices[j]);
            p.multiplyScalar(0.5);

            // the index of the new vertex.
            const index = vertices.length;
            vertices.push(p);

            // cache the position of the new vertex.
            cache.set(key, index);

            return index;
        }

        // The resulting triangles.
        const subdividedFaces: Face3[] = [];

        while (true) {
            const face = faces.shift();

            if (!face) {
                break;
            }

            // get the vertices of the current triangle.
            const [a, b, c] = [vertices[face.a], vertices[face.b], vertices[face.c]];

            // get the angles
            const [alpha, beta, gamma] = [a.angleTo(b), b.angleTo(c), c.angleTo(a)];

            // find the maximum angle
            const m = Math.max(alpha, Math.max(beta, gamma));

            // split the triangle if needed.
            if (m <= this.angle) {
                subdividedFaces.push(face);
            } else if (alpha === m) {
                const d = middleVertex(face.a, face.b);
                faces.push(new Face3(face.a, d, face.c));
                faces.push(new Face3(d, face.b, face.c));
            } else if (beta === m) {
                const d = middleVertex(face.b, face.c);
                faces.push(new Face3(face.a, face.b, d));
                faces.push(new Face3(face.a, d, face.c));
            } else if (gamma === m) {
                const d = middleVertex(face.c, face.a);
                faces.push(new Face3(face.a, face.b, d));
                faces.push(new Face3(d, face.b, face.c));
            } else {
                throw new Error("failed to subdivide the given geometry");
            }
        }

        geometry.faces = subdividedFaces;
        geometry.verticesNeedUpdate = true;
        geometry.elementsNeedUpdate = true;

        return geometry;
    }
}
