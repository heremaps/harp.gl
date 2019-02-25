/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fills an index buffer with the indices for the edges of a polygon contour.
 *
 * @param edgeIndexBuffer Edge index buffer to be filled.
 * @param vertexOffset Starting offset of the vertices composing the contour.
 * @param contour Vertices that compose the contour.
 * @param contourEdges Collection of booleans indicating if contour edges should be added.
 *
 */
export function addPolygonEdges(
    edgeIndexBuffer: number[],
    vertexOffset: number,
    contour: number[],
    contourEdges: boolean[]
) {
    for (let i = 0; i < contour.length; i += 2) {
        const edgeIdx = i / 2;
        if (contourEdges[edgeIdx]) {
            const vFootprint0 = vertexOffset + edgeIdx;
            const vRoof0 = vertexOffset + ((edgeIdx + 1) % contourEdges.length);
            edgeIndexBuffer.push(vFootprint0, vRoof0);
        }
    }
}
