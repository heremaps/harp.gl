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
 * Fills an index buffer with the indices for the edges of a polygon contour.
 *
 * @param indexBuffer Edge index buffer to be filled.
 * @param vertexOffset Starting offset of the vertices composing the contour.
 * @param polygonContour Vertices that compose the contour.
 * @param polygonContourEdges Collection of booleans indicating if contour edges should be added.
 */
export function addPolygonEdges(
    indexBuffer: number[],
    vertexOffset: number,
    polygonContour: number[],
    polygonContourEdges: boolean[],
    isExtruded?: boolean,
    addFootprintEdges?: boolean,
    wallEdgeSlope?: number
) {
    for (let i = 0; i < polygonContour.length; i += 2) {
        const edgeIdx = i / 2;
        if (polygonContourEdges[edgeIdx]) {
            if (isExtruded === true) {
                const vFootprint0 = vertexOffset + i;
                const vRoof0 = vertexOffset + i + 1;
                const vFootprint1 = vertexOffset + ((i + 2) % polygonContour.length);
                const vRoof1 = vertexOffset + ((i + 3) % polygonContour.length);

                if (addFootprintEdges === true) {
                    indexBuffer.push(vFootprint0, vFootprint1);
                }
                indexBuffer.push(vRoof0, vRoof1);

                const prevEdgeIdx = (i === 0 ? polygonContour.length : i) - 2;
                if (polygonContourEdges[prevEdgeIdx / 2]) {
                    if (wallEdgeSlope !== undefined) {
                        const v0x = polygonContour[i];
                        const v0y = polygonContour[i + 1];
                        const v1x = polygonContour[(i + 2) % polygonContour.length];
                        const v1y = polygonContour[(i + 3) % polygonContour.length];

                        currEdgeStart.set(v0x, v0y);
                        currEdgeGoal.set(v1x, v1y);
                        prevEdgeStart.set(
                            polygonContour[prevEdgeIdx],
                            polygonContour[prevEdgeIdx + 1]
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
                const vFoot0 = vertexOffset + edgeIdx;
                const vRoof0 = vertexOffset + ((edgeIdx + 1) % polygonContourEdges.length);
                indexBuffer.push(vFoot0, vRoof0);
            }
        }
    }
}
