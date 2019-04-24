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
 * @param vertexStride Number of elements per contour vertex.
 * @param contour Vertices that compose the contour.
 * @param contourEdges Collection of booleans indicating if contour edges should be added.
 * @param boundaryWalls If `false`, walls in tile boundaries will not be created.
 *
 */
export function addExtrudedWalls(
    indexBuffer: number[],
    vertexOffset: number,
    vertexStride: number,
    contour: number[],
    contourEdges?: boolean[],
    boundaryWalls?: boolean
): void {
    // Infer the index buffer's position of the vertices that form the extruded-polygons' walls
    // by stepping through the contour segment by segment.
    const nSegments = contour.length / vertexStride;
    for (let i = 0; i < nSegments; ++i) {
        const vFootprint0 = vertexOffset + i * 2;
        const vRoof0 = vFootprint0 + 1;
        const vFootprint1 = vertexOffset + ((i + 1) % nSegments) * 2;
        const vRoof1 = vFootprint1 + 1;
        if (boundaryWalls !== false || contourEdges === undefined) {
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);
        } else if (contourEdges[i]) {
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);
        }
    }
}
