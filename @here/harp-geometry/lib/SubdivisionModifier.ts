/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { BufferAttribute, BufferGeometry, Vector3 } from "three";

const tmpVectorA = new Vector3();
const tmpVectorB = new Vector3();
const tmpVectorC = new Vector3();

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
     * Subdivides the faces of the given [[THREE.BufferGeometry]].
     *
     * This method modifies (in-place) the vertices and the faces of the geometry.
     * Please note that only the vertex position and their UV coordinates are subdivided.
     * Normals, vertex colors and other attributes are left unmodified.
     *
     * @param geometry - The [[THREE.BufferGeometry]] to subdivide.
     */
    modify(geometry: BufferGeometry): BufferGeometry {
        const positionAttr = geometry.getAttribute("position") as BufferAttribute;
        const position = Array.from(positionAttr.array);

        const uvAttr = geometry.getAttribute("uv") as BufferAttribute;
        const uv = uvAttr !== undefined ? Array.from(uvAttr.array) : undefined;

        const edgeAttr = geometry.getAttribute("edge") as BufferAttribute;
        const edge = edgeAttr !== undefined ? Array.from(edgeAttr.array) : undefined;

        const wallAttr = geometry.getAttribute("wall") as BufferAttribute;
        const wall = wallAttr !== undefined ? Array.from(wallAttr.array) : undefined;

        const indexAttr = geometry.getIndex() as BufferAttribute;
        const indices = Array.from(indexAttr.array);

        // A cache containing the indices of the vertices added
        // when subdiving the faces of the geometry.
        const cache = new Map<string, number>();

        /**
         * Returns the index of the vertex positioned in the middle of the given vertices.
         */
        function middleVertex(i: number, j: number): number {
            // Build a unique `key` for the pair of indices `(i, j)`.
            const key = `${Math.min(i, j)}_${Math.max(i, j)}`;

            const h = cache.get(key);

            if (h !== undefined) {
                // Nothing to do, a vertex in the middle of (i, j) was already created.
                return h;
            }

            // The position of the new vertex.
            tmpVectorA.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
            tmpVectorB.set(position[j * 3], position[j * 3 + 1], position[j * 3 + 2]);
            tmpVectorC.lerpVectors(tmpVectorA, tmpVectorB, 0.5);

            // The index of the new vertex.
            const index = position.length / 3;
            position.push(...tmpVectorC.toArray());
            // Cache the position of the new vertex.
            cache.set(key, index);

            // The uvs of the new vertex.
            if (uv !== undefined) {
                tmpVectorA.set(uv[i * 2], uv[i * 2 + 1], 0);
                tmpVectorB.set(uv[j * 2], uv[j * 2 + 1], 0);
                tmpVectorC.lerpVectors(tmpVectorA, tmpVectorB, 0.5);
                uv.push(tmpVectorC.x, tmpVectorC.y);
            }

            // The edge and wall attributes of the new vertex.
            // If a new vertex has been introduced between i and j, connect the elements
            // accordingly.
            if (edge !== undefined) {
                if (edge[i] === j) {
                    edge.push(j);
                    edge[i] = index;
                } else if (edge[j] === i) {
                    edge.push(i);
                    edge[j] = index;
                } else {
                    edge.push(-1);
                }
            }
            if (wall !== undefined) {
                if (wall[i] === j) {
                    wall.push(j);
                    wall[i] = index;
                } else if (wall[j] === i) {
                    wall.push(i);
                    wall[j] = index;
                } else {
                    wall.push(-1);
                }
            }

            return index;
        }

        const newIndices = [];
        while (indices.length >= 3) {
            const v0 = indices.shift()!;
            const v1 = indices.shift()!;
            const v2 = indices.shift()!;

            tmpVectorA.set(position[v0 * 3], position[v0 * 3 + 1], position[v0 * 3 + 2]);
            tmpVectorB.set(position[v1 * 3], position[v1 * 3 + 1], position[v1 * 3 + 2]);
            tmpVectorC.set(position[v2 * 3], position[v2 * 3 + 1], position[v2 * 3 + 2]);

            const edgeToSplit = this.shouldSplitTriangle(tmpVectorA, tmpVectorB, tmpVectorC);

            switch (edgeToSplit) {
                case 0: {
                    const v3 = middleVertex(v0, v1);
                    indices.push(v0, v3, v2, v3, v1, v2);
                    break;
                }

                case 1: {
                    const v3 = middleVertex(v1, v2);
                    indices.push(v0, v1, v3, v0, v3, v2);
                    break;
                }

                case 2: {
                    const v3 = middleVertex(v2, v0);
                    indices.push(v0, v1, v3, v3, v1, v2);
                    break;
                }

                case undefined: {
                    newIndices.push(v0, v1, v2);
                    break;
                }

                default:
                    throw new Error("failed to subdivide the given geometry");
            }
        }

        positionAttr.array =
            positionAttr.array instanceof Float32Array
                ? new Float32Array(position)
                : new Float64Array(position);
        positionAttr.count = position.length / positionAttr.itemSize;
        positionAttr.needsUpdate = true;

        geometry.setIndex(newIndices);

        if (uv !== undefined) {
            uvAttr.array = new Float32Array(uv);
            uvAttr.count = uv.length / uvAttr.itemSize;
            uvAttr.needsUpdate = true;
        }

        if (edge !== undefined) {
            edgeAttr.array = new Float32Array(edge);
            edgeAttr.count = edge.length / edgeAttr.itemSize;
            edgeAttr.needsUpdate = true;
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
     * @param a - The position of the first vertex of the triangle.
     * @param b - The position of the second vertex of the triangle.
     * @param c - The position of the third vertex of the triangle.
     */
    protected abstract shouldSplitTriangle(a: Vector3, b: Vector3, c: Vector3): number | undefined;
}
