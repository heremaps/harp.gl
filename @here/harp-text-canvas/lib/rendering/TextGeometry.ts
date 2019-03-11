/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { GlyphData } from "./GlyphData";
import { TextStyle } from "./TextStyle";

const MAX_CAPACITY = 65536;
const VERTEX_BUFFER_STRIDE = 16;
const INDEX_BUFFER_STRIDE = 1;
const VERTICES_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;
const QUAD_VERTEX_MEMORY_FOOTPRINT = VERTICES_PER_QUAD * VERTEX_BUFFER_STRIDE;
const QUAD_INDEX_MEMORY_FOOTPRINT = INDICES_PER_QUAD * INDEX_BUFFER_STRIDE;

/**
 * Interface containing user-supplied picking data, as well as the [[TextGeometry]] range it's
 * assigned to.
 */
interface PickingData {
    start: number;
    end: number;
    data: any;
}

/**
 * Procedural geometry that holds vertex attribute data for all glyphs in a [[TextCanvas]].
 */
export class TextGeometry {
    /**
     * Maximum glyph capacity.
     */
    readonly capacity: number;

    private m_drawCount: number;
    private m_updateOffset: number;

    private m_vertexBuffer: THREE.InterleavedBuffer;
    private m_positionAttribute: THREE.InterleavedBufferAttribute;
    private m_uvAttribute: THREE.InterleavedBufferAttribute;
    private m_colorAttribute: THREE.InterleavedBufferAttribute;
    private m_bgColorAttribute: THREE.InterleavedBufferAttribute;
    private m_indexBuffer: THREE.BufferAttribute;

    private m_geometry: THREE.BufferGeometry;
    private m_mesh: THREE.Mesh;
    private m_bgMesh: THREE.Mesh;

    private m_pickingCount: number;
    private m_pickingDataArray: PickingData[];

    /**
     * Creates a new `TextGeometry`.
     *
     * @param material Material used to render foreground glyphs.
     * @param backgroundMaterial Material used to render background glyphs.
     * @param capacity Maximum glyph capacity.
     *
     * @returns New `TextGeometry`.
     */
    constructor(
        material: THREE.MeshMaterialType,
        backgroundMaterial: THREE.MeshMaterialType,
        capacity: number
    ) {
        this.capacity = Math.min(capacity, MAX_CAPACITY);
        this.m_drawCount = 0;
        this.m_updateOffset = 0;

        this.m_vertexBuffer = new THREE.InterleavedBuffer(
            new Float32Array(this.capacity * QUAD_VERTEX_MEMORY_FOOTPRINT),
            VERTEX_BUFFER_STRIDE
        );
        this.m_vertexBuffer.setDynamic(true);
        this.m_positionAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 0);
        this.m_uvAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 4);
        this.m_colorAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 8);
        this.m_bgColorAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 12);

        this.m_indexBuffer = new THREE.BufferAttribute(
            new Uint32Array(this.capacity * QUAD_INDEX_MEMORY_FOOTPRINT),
            INDEX_BUFFER_STRIDE
        );
        this.m_indexBuffer.setDynamic(true);

        this.m_geometry = new THREE.BufferGeometry();
        this.m_geometry.addAttribute("position", this.m_positionAttribute);
        this.m_geometry.addAttribute("uv", this.m_uvAttribute);
        this.m_geometry.addAttribute("color", this.m_colorAttribute);
        this.m_geometry.addAttribute("bgColor", this.m_bgColorAttribute);
        this.m_geometry.setIndex(this.m_indexBuffer);

        this.m_mesh = new THREE.Mesh(this.m_geometry, material);
        this.m_mesh.renderOrder = Infinity;
        this.m_bgMesh = new THREE.Mesh(this.m_geometry, backgroundMaterial);

        this.m_pickingCount = 0;
        this.m_pickingDataArray = new Array(capacity);
    }

    /**
     * Release all allocated resources.
     */
    dispose() {
        this.m_geometry.dispose();
    }

    /**
     * Count of currently drawn glyphs.
     */
    get drawCount(): number {
        return this.m_drawCount;
    }

    /**
     * Mesh used to render foreground glyphs.
     */
    get mesh(): THREE.Mesh {
        return this.m_mesh;
    }

    /**
     * Mesh used to render background glyphs.
     */
    get backgroundMesh(): THREE.Mesh {
        return this.m_bgMesh;
    }

    /**
     * Clear the geometry.
     */
    clear() {
        this.m_drawCount = 0;
        this.m_updateOffset = 0;
        this.m_pickingCount = 0;
    }

    /**
     * Update the GPU resources to reflect the latest additions to the geometry.
     */
    update() {
        if (this.drawCount > this.m_updateOffset) {
            this.m_vertexBuffer.needsUpdate = true;
            this.m_vertexBuffer.updateRange.offset =
                this.m_updateOffset * QUAD_VERTEX_MEMORY_FOOTPRINT;
            this.m_vertexBuffer.updateRange.count =
                (this.m_drawCount - this.m_updateOffset) * QUAD_VERTEX_MEMORY_FOOTPRINT;
            this.m_indexBuffer.needsUpdate = true;
            this.m_indexBuffer.updateRange.offset =
                this.m_updateOffset * QUAD_INDEX_MEMORY_FOOTPRINT;
            this.m_indexBuffer.updateRange.count =
                (this.m_drawCount - this.m_updateOffset) * QUAD_INDEX_MEMORY_FOOTPRINT;
        }
        this.m_updateOffset = this.m_drawCount;
        this.m_geometry.setDrawRange(0, this.m_drawCount * INDICES_PER_QUAD);
    }

    /**
     * Add a new glyph to the `TextGeometry`.
     *
     * @param glyphData [[GlyphData]] holding the glyph description.
     * @param corners Transformed glyph corners.
     * @param weight Foreground glyph sampling weight.
     * @param bgWeight Foreground glyph sampling weight.
     * @param mirrored If `true`, UVs will be horizontally mirrored (needed for RTL punctuation).
     * @param style Currently set [[TextStyle]].
     * @param isCopyGeometry If `true`, it will use the original UVs to copy the glyph data.
     *
     * @returns Result of the addition.
     */
    add(
        glyphData: GlyphData,
        corners: THREE.Vector3[],
        weight: number,
        bgWeight: number,
        mirrored: boolean,
        style: TextStyle,
        isCopyGeometry?: boolean
    ): boolean {
        if (this.m_drawCount >= this.capacity) {
            return false;
        }

        const baseVertex = this.m_drawCount * VERTICES_PER_QUAD;
        const baseIndex = this.m_drawCount * INDICES_PER_QUAD;

        for (let i = 0; i < VERTICES_PER_QUAD; ++i) {
            this.m_positionAttribute.setXYZW(
                baseVertex + i,
                corners[i].x,
                corners[i].y,
                corners[i].z,
                isCopyGeometry === true
                    ? glyphData.copyIndex
                    : (mirrored ? -1.0 : 1.0) * style.glyphRotation!
            );
            const mirroredUVIdx = mirrored ? ((i + 1) % 2) + Math.floor(i / 2) * 2 : i;
            this.m_uvAttribute.setXYZW(
                baseVertex + i,
                (isCopyGeometry === true
                    ? glyphData.sourceTextureCoordinates
                    : glyphData.dynamicTextureCoordinates)[mirroredUVIdx].x,
                (isCopyGeometry === true
                    ? glyphData.sourceTextureCoordinates
                    : glyphData.dynamicTextureCoordinates)[mirroredUVIdx].y,
                weight,
                bgWeight
            );
            this.m_colorAttribute.setXYZW(
                baseVertex + i,
                style.color!.r,
                style.color!.g,
                style.color!.b,
                style.opacity!
            );
            this.m_bgColorAttribute.setXYZW(
                baseVertex + i,
                style.backgroundColor!.r,
                style.backgroundColor!.g,
                style.backgroundColor!.b,
                style.backgroundOpacity!
            );
        }

        this.m_indexBuffer.setX(baseIndex, baseVertex);
        this.m_indexBuffer.setX(baseIndex + 1, baseVertex + 1);
        this.m_indexBuffer.setX(baseIndex + 2, baseVertex + 2);
        this.m_indexBuffer.setX(baseIndex + 3, baseVertex + 2);
        this.m_indexBuffer.setX(baseIndex + 4, baseVertex + 1);
        this.m_indexBuffer.setX(baseIndex + 5, baseVertex + 3);

        ++this.m_drawCount;
        return true;
    }

    /**
     * Adds picking data for glyphs from the specified start until the last glyph added.
     *
     * @param startIdx First glyph index that this picking data is associated to.
     * @param endIdx Last glyph index that this picking data is associated to.
     * @param pickingData Picking data to be added.
     */
    addPickingData(startIdx: number, endIdx: number, pickingData: any): boolean {
        if (this.m_pickingCount >= this.capacity) {
            return false;
        }

        this.m_pickingDataArray[this.m_pickingCount] = {
            start: Math.min(startIdx, this.capacity),
            end: Math.min(endIdx, this.capacity),
            data: pickingData
        };

        ++this.m_pickingCount;
        return true;
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple glyphs
     * are found, the order of the results is unspecified.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     */
    pick(screenPosition: THREE.Vector2, pickCallback: (pickData: any | undefined) => void) {
        for (const pickingData of this.m_pickingDataArray) {
            if (pickingData === undefined) {
                return;
            }

            for (let i = pickingData.start; i < pickingData.end; ++i) {
                const positionIndex = i * 4;

                const minX = Math.min(
                    this.m_positionAttribute.getX(positionIndex + 2),
                    this.m_positionAttribute.getX(positionIndex + 1)
                );
                if (screenPosition.x < minX) {
                    continue;
                }

                const maxX = Math.max(
                    this.m_positionAttribute.getX(positionIndex + 2),
                    this.m_positionAttribute.getX(positionIndex + 1)
                );
                if (screenPosition.x > maxX) {
                    continue;
                }

                const minY = Math.min(
                    this.m_positionAttribute.getY(positionIndex + 2),
                    this.m_positionAttribute.getY(positionIndex + 1)
                );
                if (screenPosition.y < minY) {
                    continue;
                }

                const maxY = Math.max(
                    this.m_positionAttribute.getY(positionIndex + 2),
                    this.m_positionAttribute.getY(positionIndex + 1)
                );
                if (screenPosition.y > maxY) {
                    continue;
                }

                pickCallback(pickingData.data);
                break;
            }
        }
    }
}
