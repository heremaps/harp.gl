/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Face3, Geometry, Vector2, Vector3 } from "three";

/**
 * The [[SubdivisionModifier]] subdivides triangle mesh geometries.
 */
export abstract class SubdivisionModifier {
    /**
     * Constructs a new [[SubdivisionModifier]].
     */
    constructor() {
        // nothing to do
    }

    /**
     * Subdivides the faces of the given [[THREE.Geometry]].
     *
     * This method modifies (in-place) the vertices and the faces of the geometry.
     * Please note that only the vertex position and their UV coordinates are subdivided.
     * Normals, vertex colors and other attributes are left unmodified.
     *
     * @param geometry The [[THREE.Geometry]] to subdivide.
     */
    modify(geometry: Geometry): Geometry {
        const { vertices, faces: faceWorkList, faceVertexUvs: oldUvs } = geometry;

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
            p.lerpVectors(vertices[i], vertices[j], 0.5);

            // the index of the new vertex.
            const index = vertices.length;
            vertices.push(p);
            // cache the position of the new vertex.
            cache.set(key, index);

            return index;
        }

        // The resulting triangles.
        const newFaces: Face3[] = [];
        const newFaceVertexUvs: Vector2[][] = [];

        const uvWorkList = oldUvs[0];
        const hasUvs = oldUvs !== undefined && oldUvs.length > 0 && uvWorkList.length > 0;

        while (true) {
            const face = faceWorkList.shift();

            if (face === undefined) {
                break;
            }

            let uvs!: Vector2[];

            if (hasUvs) {
                uvs = uvWorkList.shift()!;
            }

            const edgeToSplit = this.shouldSplitTriangle(
                vertices[face.a],
                vertices[face.b],
                vertices[face.c]
            );

            switch (edgeToSplit) {
                case 0: {
                    const d = middleVertex(face.a, face.b);
                    faceWorkList.push(new Face3(face.a, d, face.c));
                    faceWorkList.push(new Face3(d, face.b, face.c));
                    if (hasUvs) {
                        const t = new Vector2().lerpVectors(uvs[0], uvs[1], 0.5);
                        uvWorkList.push([uvs[0], t, uvs[2]], [t, uvs[1], uvs[2]]);
                    }
                    break;
                }

                case 1: {
                    const d = middleVertex(face.b, face.c);
                    faceWorkList.push(new Face3(face.a, face.b, d));
                    faceWorkList.push(new Face3(face.a, d, face.c));
                    if (hasUvs) {
                        const t = new Vector2().lerpVectors(uvs[1], uvs[2], 0.5);
                        uvWorkList.push([uvs[0], uvs[1], t], [uvs[0], t, uvs[2]]);
                    }
                    break;
                }

                case 2: {
                    const d = middleVertex(face.c, face.a);
                    faceWorkList.push(new Face3(face.a, face.b, d));
                    faceWorkList.push(new Face3(d, face.b, face.c));
                    if (hasUvs) {
                        const t = new Vector2().lerpVectors(uvs[2], uvs[0], 0.5);
                        uvWorkList.push([uvs[0], uvs[1], t], [t, uvs[1], uvs[2]]);
                    }
                    break;
                }

                case undefined: {
                    newFaces.push(face);
                    if (hasUvs) {
                        newFaceVertexUvs.push(uvs);
                    }
                    break;
                }

                default:
                    throw new Error("failed to subdivide the given geometry");
            } // switch
        }

        geometry.faces = newFaces;
        geometry.verticesNeedUpdate = true;
        geometry.elementsNeedUpdate = true;

        if (hasUvs) {
            geometry.faceVertexUvs[0] = newFaceVertexUvs;
            geometry.uvsNeedUpdate = true;
        }

        return geometry;
    }

    /**
     * Returns if the given triangle should be subdivide.
     *
     * Implementations of this function should return the index of
     * the edge of the triangle to split (0, 1, or 2) or undefined if
     * the triangle doesn't need to be subdivided.
     *
     * @param a The position of the first vertex of the triangle.
     * @param b The position of the second vertex of the triangle.
     * @param c The position of the third vertex of the triangle.
     */
    protected abstract shouldSplitTriangle(a: Vector3, b: Vector3, c: Vector3): number | undefined;
}
