/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

const currEdgeStart = new THREE.Vector2();
const currEdgeGoal = new THREE.Vector2();
const prevEdgeStart = new THREE.Vector2();
const prevEdgeGoal = new THREE.Vector2();

/**
 * Fills an index buffer with the indices for the extruded walls for a polygon contour.
 *
 * @param indexBuffer Index buffer to be filled.
 * @param vertexOffset Starting offset of the vertices composing the contour.
 * @param contourEdges Collection of booleans indicating if contour edges should be added.
 * @param boundaryWalls If `false`, walls in tile boundaries will not be created.
 *
 */
export function addExtrudedWalls(
    indexBuffer: number[],
    vertexOffset: number,
    contourEdges: boolean[],
    boundaryWalls?: boolean
): void {
    // Infer the index buffer's position of the vertices that form the extruded-polygons' walls
    // by stepping through the contour segment by segment.
    for (let i = 0; i < contourEdges.length; ++i) {
        const vFootprint0 = vertexOffset + i * 2;
        const vRoof0 = vFootprint0 + 1;
        const vFootprint1 = vertexOffset + ((i + 1) % contourEdges.length) * 2;
        const vRoof1 = vFootprint1 + 1;
        if (contourEdges[i] || (!contourEdges[i] && boundaryWalls !== false)) {
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);
        }
    }
}
