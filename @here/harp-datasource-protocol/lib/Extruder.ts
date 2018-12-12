/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Geometry } from "./DecodedTile";
import { IMeshBuffers } from "./IMeshBuffers";

import * as THREE from "three";

/**
 * The extruder class extrudes the footprint of a polygon.
 */
export class Extruder {
    /**
     *
     * @param m_currEdgeStart Current edge start vector.
     * @param m_currEdgeGoal Current edge goal vector.
     * @param m_prevEdgeStart Current edge start vector.
     * @param m_prevEdgeGoal Current edge goal vector.
     */
    constructor(
        private readonly m_currEdgeStart: THREE.Vector2 = new THREE.Vector2(),
        private readonly m_currEdgeGoal: THREE.Vector2 = new THREE.Vector2(),
        private readonly m_prevEdgeStart: THREE.Vector2 = new THREE.Vector2(),
        private readonly m_prevEdgeGoal: THREE.Vector2 = new THREE.Vector2()
    ) {}

    /**
     * Add the indices for the edge geometry.
     *
     * @param indexBuffer Index buffer to be filled.
     * @param vertexOffset Starting offset of the vertices composing the contour.
     * @param contour Collection of vertices composing the contour.
     * @param processEdges  Add the indices for the edges.
     * @param edgeIndexBuffer Buffer containing the edge indices.
     * @param tileExtents Value that defines the extension of the tiles.
     * @param enableFootprints Value that tells if the footprint has to be added or not.
     * @param edgeSlope Minimum angle between two walls for which an edge is created.
     *
     */
    addExtrudedWalls(
        indexBuffer: number[],
        vertexOffset: number,
        contour: number[],
        processEdges: boolean,
        edgeIndexBuffer: number[],
        tileExtents: number,
        enableFootprints: boolean,
        edgeSlope: number
    ): void {
        // Infer the index buffer's position of the vertices that form the extruded-polygons' walls
        // by stepping through the contour segment by segment.
        for (let i = 0; i < contour.length; i += 2) {
            const vFootprint0 = vertexOffset + i;
            const vRoof0 = vertexOffset + i + 1;
            const vFootprint1 = vertexOffset + ((i + 2) % contour.length);
            const vRoof1 = vertexOffset + ((i + 3) % contour.length);
            indexBuffer.push(vFootprint0, vRoof0, vRoof1, vRoof1, vFootprint1, vFootprint0);

            // Add the indices for the edges the same way if needed (removing unwanted edges in the
            // tiles' borders).
            if (processEdges) {
                const v0x = contour[i];
                const v0y = contour[i + 1];
                const v1x = contour[(i + 2) % contour.length];
                const v1y = contour[(i + 3) % contour.length];

                // When dealing with a starting point inside the tile extents, a horizontal edge
                // should be added. For vertical edges, this is true only when the slope angle falls
                // in the allowed range.
                if (Math.abs(v0x) < tileExtents && Math.abs(v0y) < tileExtents) {
                    if (enableFootprints) {
                        edgeIndexBuffer.push(vFootprint0, vFootprint1);
                    }
                    edgeIndexBuffer.push(vRoof0, vRoof1);

                    if (i !== 0) {
                        this.m_currEdgeStart.set(v0x, v0y);
                        this.m_currEdgeGoal.set(v1x, v1y);
                        this.m_prevEdgeStart.set(contour[i - 2], contour[i - 1]);
                        this.m_prevEdgeGoal.set(this.m_currEdgeStart.x, this.m_currEdgeStart.y);

                        if (
                            this.m_prevEdgeGoal
                                .sub(this.m_prevEdgeStart)
                                .normalize()
                                .dot(this.m_currEdgeGoal.sub(this.m_currEdgeStart).normalize()) <=
                            edgeSlope
                        ) {
                            edgeIndexBuffer.push(vFootprint0, vRoof0);
                        }
                    } else if (edgeSlope > 0.0) {
                        edgeIndexBuffer.push(vFootprint0, vRoof0);
                    }
                }
                // When our end point is inside the tile extents, a horizontal edge should be added.
                else if (Math.abs(v1x) < tileExtents && Math.abs(v1y) < tileExtents) {
                    if (enableFootprints) {
                        edgeIndexBuffer.push(vFootprint0, vFootprint1);
                    }
                    edgeIndexBuffer.push(vRoof0, vRoof1);
                }
                // When moving from the tile borders closer into the tile center, a horizontal edge
                // should be added.
                else if (
                    Math.abs(v0x) >= tileExtents &&
                    Math.abs(v0y) < tileExtents &&
                    (Math.abs(v1y) >= tileExtents && Math.abs(v1x) < tileExtents)
                ) {
                    if (enableFootprints) {
                        edgeIndexBuffer.push(vFootprint0, vFootprint1);
                    }
                    edgeIndexBuffer.push(vRoof0, vRoof1);
                } else if (
                    Math.abs(v0y) >= tileExtents &&
                    Math.abs(v0x) < tileExtents &&
                    (Math.abs(v1x) >= tileExtents && Math.abs(v1y) < tileExtents)
                ) {
                    if (enableFootprints) {
                        edgeIndexBuffer.push(vFootprint0, vFootprint1);
                    }
                    edgeIndexBuffer.push(vRoof0, vRoof1);
                }
            }
        }
    }

    /**
     * Iterate through the outline indices array contained in the meshBuffers and add them to the
     * geometry as a buffer attribute.
     *
     * @param meshBuffers Buffer containing the accumulated edge indices.
     * @param geometry Geometry in which the edge indices are stored as an attribute.
     *
     */
    addEdgeIndicesArrayToGeometry(meshBuffers: IMeshBuffers, geometry: Geometry): void {
        if (meshBuffers.edgeIndices.length === 0) {
            return;
        }

        // TODO: use uint16 for buffers when possible. Issue HARP-3987
        geometry.edgeIndex = {
            name: "edgeIndex",
            buffer: new Uint32Array(meshBuffers.edgeIndices).buffer as ArrayBuffer,
            itemCount: 1,
            type: "uint32"
        };
    }
}
