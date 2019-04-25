/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fills an index buffer with the indices for the extruded walls for a polygon contour.
 *
 * @param indexBuffer Index buffer to be filled.
 * @param vertexOffset Starting offset of the vertices composing the contour.
 * @param contour Collection of vertices composing the contour.
 * @param contourEdges Collection of booleans indicating if contour edges should be added.
 * @param boundaryWalls If `false`, walls in tile boundaries will not be created.
 *
 */
export function addExtrudedWalls(
    indexBuffer: number[],
    vertexOffset: number,
    contour: number[],
    contourEdges?: boolean[],
    boundaryWalls?: boolean
): void {
    // Infer the index buffer's position of the vertices that form the extruded-polygons' walls
    // by stepping through the contour segment by segment.
    for (let i = 0; i < contour.length; i += 2) {
        const vFootprint0 = vertexOffset + i;
        const vRoof0 = vertexOffset + i + 1;
        const vFootprint1 = vertexOffset + ((i + 2) % contour.length);
        const vRoof1 = vertexOffset + ((i + 3) % contour.length);
        if (
            contourEdges === undefined ||
            contourEdges[i / 2] ||
            (!contourEdges[i / 2] && boundaryWalls !== false)
        ) {
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);
        }
    }
}
