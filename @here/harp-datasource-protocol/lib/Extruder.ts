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
 * @param edgeIndexBuffer Edge index buffer to be filled.
 * @param vertexOffset Starting offset of the vertices composing the contour.
 * @param contour Collection of vertices composing the contour.
 * @param boundaryWalls If `false`, walls in tile boundaries will not be created.
 * @param contourEdges Collection of booleans indicating if contour edges should be added.
 * @param footprintEdges Value that tells if the footprint has to be added or not.
 * @param edgeSlope Minimum angle between two walls for which an edge is created.
 *
 */
export function addExtrudedWalls(
    indexBuffer: number[],
    edgeIndexBuffer: number[],
    vertexOffset: number,
    contour: number[],
    boundaryWalls?: boolean,
    contourEdges?: boolean[],
    footprintEdges?: boolean,
    edgeSlope?: number
): void {
    // Infer the index buffer's position of the vertices that form the extruded-polygons' walls
    // by stepping through the contour segment by segment.
    for (let i = 0; i < contour.length; i += 2) {
        const vFootprint0 = vertexOffset + i;
        const vRoof0 = vertexOffset + i + 1;
        const vFootprint1 = vertexOffset + ((i + 2) % contour.length);
        const vRoof1 = vertexOffset + ((i + 3) % contour.length);
        if (contourEdges === undefined || contourEdges[i / 2] || boundaryWalls !== false) {
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);
        }

        // Add the indices for the edges the same way if needed (removing unwanted edges in the
        // tiles' borders).
        if (contourEdges !== undefined && contourEdges[i / 2]) {
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);

            const v0x = contour[i];
            const v0y = contour[i + 1];
            const v1x = contour[(i + 2) % contour.length];
            const v1y = contour[(i + 3) % contour.length];

            // Check for horizontal edges.
            if (footprintEdges === true) {
                edgeIndexBuffer.push(vFootprint0, vFootprint1);
            }
            edgeIndexBuffer.push(vRoof0, vRoof1);

            // Check for vertical edges.
            const prevEdgeIdx = (i === 0 ? contour.length : i) - 2;
            if (contourEdges[prevEdgeIdx / 2]) {
                if (edgeSlope !== undefined) {
                    currEdgeStart.set(v0x, v0y);
                    currEdgeGoal.set(v1x, v1y);
                    prevEdgeStart.set(contour[prevEdgeIdx], contour[prevEdgeIdx + 1]);
                    prevEdgeGoal.set(currEdgeStart.x, currEdgeStart.y);

                    if (
                        prevEdgeGoal
                            .sub(prevEdgeStart)
                            .normalize()
                            .dot(currEdgeGoal.sub(currEdgeStart).normalize()) <= edgeSlope
                    ) {
                        edgeIndexBuffer.push(vFootprint0, vRoof0);
                    }
                } else {
                    edgeIndexBuffer.push(vFootprint0, vRoof0);
                }
            }
        }
    }
}
