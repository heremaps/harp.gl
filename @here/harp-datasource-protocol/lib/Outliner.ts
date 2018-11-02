/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Geometry, IMeshBuffers } from "@here/harp-datasource-protocol";
import { indexNeeded } from "./OutlineIndicesDetector";

const INDEX_BUFFER_LIMIT = 65536; //Math.pow(2, 16); Maximum size for the index buffer in webGL 1.0.

/**
 * The Outliner class read the outlines indices in the [IMeshBuffer] and add them to the [Geometry].
 */
export class Outliner {
    /**
     *
     * @param m_tmpOutlineIndices Array that stores the cached indices until the INDEX_BUFFER_LIMIT
     * is reached. Empty by default.
     */
    constructor(private m_tmpOutlineIndices: number[] = []) {}

    /**
     * Iterate through the outline indices array contained in the meshBuffers and add them to the
     * geometry as a buffer attribute.
     *
     * @param meshBuffers Buffer containing the accumulated outline indices.
     * @param geometry Geometry in which the outline indices are stored as an attribute.
     *
     */
    addOutlineIndicesArrayToGeometry(meshBuffers: IMeshBuffers, geometry: Geometry): void {
        if (meshBuffers.outlineIndices.length === 0) {
            return;
        }

        if (geometry.outlineIndicesAttributes === undefined) {
            geometry.outlineIndicesAttributes = [];
        }
        for (const edgesArray of meshBuffers.outlineIndices) {
            // create the edge index buffer 2D array
            geometry.outlineIndicesAttributes.push({
                name: "edgeIndicesArray",
                buffer: new Uint32Array(edgesArray).buffer as ArrayBuffer,
                itemCount: 1,
                type: "uint32"
            });
        }
    }

    /**
     * Add edges to the [IMeshBuffer] outlineIndices array.
     *
     * @param offset Starting offset of the vertices defining the contour.
     * @param contour Vertices that compose the contour.
     * @param tileExtents Value that defines the extension of the tile.
     * @param meshBufferOutlineIndices Buffer where the indices are accumulated.
     *
     */
    addEdges(
        offset: number,
        contour: number[],
        tileExtents: number,
        meshBufferOutlineIndices: number[][]
    ): void {
        for (let i = 0; i < contour.length; i += 2) {
            const vFootprint0 = offset + i / 2;
            const vFootprint1 = offset + ((i + 2) % contour.length) / 2;

            if (this.m_tmpOutlineIndices.length > INDEX_BUFFER_LIMIT) {
                meshBufferOutlineIndices.push(this.m_tmpOutlineIndices);
                this.m_tmpOutlineIndices = [];
            }
            this.addEdge(contour, i, vFootprint0, vFootprint1, tileExtents);
        }
    }

    /**
     * Fill out the outlineIndices array with the outline indices collected.
     *
     * @param outlineIndices Array to be filled.
     */
    fill(outlineIndices: number[][]) {
        if (this.m_tmpOutlineIndices.length !== 0) {
            outlineIndices.push(this.m_tmpOutlineIndices);
            this.m_tmpOutlineIndices = [];
        }
    }

    private addEdge(
        contour: number[],
        contourIdx: number,
        start: number,
        end: number,
        tileExtents: number
    ): void {
        const v0x = contour[contourIdx];
        const v0y = contour[contourIdx + 1];
        const v1x = contour[(contourIdx + 2) % contour.length];
        const v1y = contour[(contourIdx + 3) % contour.length];

        if (indexNeeded(v0x, v0y, v1x, v1y, tileExtents)) {
            this.m_tmpOutlineIndices.push(start, end);
        }
    }
}
