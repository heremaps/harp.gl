/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

const currEdgeStart = new THREE.Vector2();
const currEdgeGoal = new THREE.Vector2();
const prevEdgeStart = new THREE.Vector2();
const prevEdgeGoal = new THREE.Vector2();

/**
 * Fills an index buffer with the indices for the edges of a polygon contour.
 *
 * @param indexBuffer - Edge index buffer to be filled.
 * @param vertexOffset - Starting offset of the vertices composing the contour.
 * @param vertexStride - Number of elements per contour vertex.
 * @param polygonContour - Vertices that compose the contour.
 * @param polygonContourEdges - Collection of booleans indicating if contour edges should be added.
 */
export function addPolygonEdges(
    indexBuffer: number[],
    vertexOffset: number,
    vertexStride: number,
    polygonContour: number[],
    polygonContourEdges: boolean[],
    isExtruded?: boolean,
    addFootprintEdges?: boolean,
    wallEdgeSlope?: number
) {
    for (let i = 0; i < polygonContourEdges.length; ++i) {
        if (polygonContourEdges[i]) {
            if (isExtruded === true) {
                const vFootprint0 = vertexOffset + i * 2;
                const vRoof0 = vFootprint0 + 1;
                const vFootprint1 = vertexOffset + ((i + 1) % polygonContourEdges.length) * 2;
                const vRoof1 = vFootprint1 + 1;

                if (addFootprintEdges === true) {
                    indexBuffer.push(vFootprint0, vFootprint1);
                }
                indexBuffer.push(vRoof0, vRoof1);

                const prevEdgeIdx = (i === 0 ? polygonContourEdges.length : i) - 1;
                if (polygonContourEdges[prevEdgeIdx]) {
                    if (wallEdgeSlope !== undefined) {
                        const v0x = polygonContour[i * vertexStride];
                        const v0y = polygonContour[i * vertexStride + 1];
                        const v1x =
                            polygonContour[((i + 1) % polygonContourEdges.length) * vertexStride];
                        const v1y =
                            polygonContour[
                                ((i + 1) % polygonContourEdges.length) * vertexStride + 1
                            ];

                        currEdgeStart.set(v0x, v0y);
                        currEdgeGoal.set(v1x, v1y);
                        prevEdgeStart.set(
                            polygonContour[prevEdgeIdx * vertexStride],
                            polygonContour[prevEdgeIdx * vertexStride + 1]
                        );
                        prevEdgeGoal.set(currEdgeStart.x, currEdgeStart.y);

                        if (
                            prevEdgeGoal
                                .sub(prevEdgeStart)
                                .normalize()
                                .dot(currEdgeGoal.sub(currEdgeStart).normalize()) <= wallEdgeSlope
                        ) {
                            indexBuffer.push(vFootprint0, vRoof0);
                        }
                    } else {
                        indexBuffer.push(vFootprint0, vRoof0);
                    }
                }
            } else {
                const vFoot0 = vertexOffset + i;
                const vRoof0 = vertexOffset + ((i + 1) % polygonContourEdges.length);
                indexBuffer.push(vFoot0, vRoof0);
            }
        }
    }
}
