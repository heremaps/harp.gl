/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

import { MemoryUsage } from "../TextCanvas";
import { GlyphData } from "./GlyphData";
import { TextBufferObject } from "./TextBufferObject";
import { TextRenderStyle } from "./TextStyle";

export const MAX_CAPACITY = 65536;
export const VERTEX_BUFFER_STRIDE = 16;
export const INDEX_BUFFER_STRIDE = 1;
export const VERTICES_PER_QUAD = 4;
export const INDICES_PER_QUAD = 6;
export const QUAD_VERTEX_MEMORY_FOOTPRINT = VERTICES_PER_QUAD * VERTEX_BUFFER_STRIDE;
export const QUAD_INDEX_MEMORY_FOOTPRINT = INDICES_PER_QUAD * INDEX_BUFFER_STRIDE;

/**
 * Number of bytes for float in an Float32Array.
 */
const NUM_BYTES_PER_FLOAT = 4;

/**
 * Number of bytes for integer number in an UInt32Array.
 */
const NUM_BYTES_PER_INT32 = 4;

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
     * Maximum glyph capacity.
     */
    readonly capacity: number;

    private m_currentCapacity: number;
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

    private m_pickingDataArray: PickingData[] = [];

    /**
     * Creates a new `TextGeometry`.
     *
     * @param material - Material used to render foreground glyphs.
     * @param backgroundMaterial - Material used to render background glyphs.
     * @param initialSize - Initial amount of glyphs that can be stored.
     * @param capacity - Maximum glyph capacity.
     *
     * @returns New `TextGeometry`.
     */
    constructor(
        readonly scene: THREE.Scene,
        material: THREE.Material,
        backgroundMaterial: THREE.Material,
        initialSize: number,
        capacity: number
    ) {
        this.capacity = Math.min(capacity, MAX_CAPACITY);
        this.m_currentCapacity = Math.min(initialSize, capacity);
        this.m_drawCount = 0;
        this.m_updateOffset = 0;

        this.m_vertexBuffer = new THREE.InterleavedBuffer(
            new Float32Array(this.m_currentCapacity * QUAD_VERTEX_MEMORY_FOOTPRINT),
            VERTEX_BUFFER_STRIDE
        );
        this.m_vertexBuffer.setUsage(THREE.DynamicDrawUsage);
        this.m_positionAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 0);
        this.m_uvAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 4);
        this.m_colorAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 8);
        this.m_bgColorAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 12);

        this.m_indexBuffer = new THREE.BufferAttribute(
            new Uint32Array(this.m_currentCapacity * QUAD_INDEX_MEMORY_FOOTPRINT),
            INDEX_BUFFER_STRIDE
        );
        this.m_indexBuffer.setUsage(THREE.DynamicDrawUsage);

        this.m_geometry = new THREE.BufferGeometry();
        this.m_geometry.setAttribute("position", this.m_positionAttribute);
        this.m_geometry.setAttribute("uv", this.m_uvAttribute);
        this.m_geometry.setAttribute("color", this.m_colorAttribute);
        this.m_geometry.setAttribute("bgColor", this.m_bgColorAttribute);
        this.m_geometry.setIndex(this.m_indexBuffer);

        this.m_mesh = new THREE.Mesh(this.m_geometry, material);
        this.m_bgMesh = new THREE.Mesh(this.m_geometry, backgroundMaterial);
        this.m_mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        this.m_bgMesh.renderOrder = Number.MAX_SAFE_INTEGER - 1;
        this.m_mesh.frustumCulled = false;
        this.m_bgMesh.frustumCulled = false;
        this.scene.add(this.m_bgMesh, this.m_mesh);
    }

    /**
     * Release all allocated resources.
     */
    dispose() {
        this.scene.remove(this.m_bgMesh, this.m_mesh);
        this.m_geometry.dispose();
    }

    /**
     * Clear the geometry.
     */
    clear() {
        this.m_drawCount = 0;
        this.m_updateOffset = 0;
        this.m_pickingDataArray.length = 0;
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
     * @param glyphData - [[GlyphData]] holding the glyph description.
     * @param corners - Transformed glyph corners.
     * @param weight - Foreground glyph sampling weight.
     * @param bgWeight - Foreground glyph sampling weight.
     * @param mirrored - If `true`, UVs will be horizontally mirrored (needed for RTL punctuation).
     * @param style - Currently set [[TextRenderStyle]].
     *
     * @returns Result of the addition.
     */
    add(
        glyphData: GlyphData,
        corners: THREE.Vector3[],
        weight: number,
        bgWeight: number,
        mirrored: boolean,
        style: TextRenderStyle
    ): boolean {
        if (this.m_drawCount >= this.capacity) {
            return false;
        } else if (this.m_drawCount >= this.m_currentCapacity) {
            const newSize = Math.min(this.m_currentCapacity * 2, this.capacity);
            this.resizeBuffers(newSize);
        }

        const baseVertex = this.m_drawCount * VERTICES_PER_QUAD;
        const baseIndex = this.m_drawCount * INDICES_PER_QUAD;

        for (let i = 0; i < VERTICES_PER_QUAD; ++i) {
            this.m_positionAttribute.setXYZW(
                baseVertex + i,
                corners[i].x,
                corners[i].y,
                corners[i].z,
                (mirrored ? -1.0 : 1.0) * style.rotation
            );
            const mirroredUVIdx = mirrored ? ((i + 1) % 2) + Math.floor(i / 2) * 2 : i;
            this.m_uvAttribute.setXYZW(
                baseVertex + i,
                glyphData.dynamicTextureCoordinates[mirroredUVIdx].x,
                glyphData.dynamicTextureCoordinates[mirroredUVIdx].y,
                weight,
                bgWeight
            );
            this.m_colorAttribute.setXYZW(
                baseVertex + i,
                style.color.r,
                style.color.g,
                style.color.b,
                style.opacity
            );
            this.m_bgColorAttribute.setXYZW(
                baseVertex + i,
                style.backgroundColor.r,
                style.backgroundColor.g,
                style.backgroundColor.b,
                style.backgroundOpacity
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
     * Add a new glyph to a text buffer.
     *
     * @param buffer - Target buffer where glyph attributes will be stored.
     * @param offset - Offset of the target buffer.
     * @param glyphData - [[GlyphData]] holding the glyph description.
     * @param corners - Transformed glyph corners.
     * @param weight - Foreground glyph sampling weight.
     * @param bgWeight - Foreground glyph sampling weight.
     * @param mirrored - If `true`, UVs will be mirrored (needed for RTL punctuation).
     * @param style - Currently set [[TextRenderStyle]].
     */
    addToBuffer(
        buffer: Float32Array,
        offset: number,
        glyphData: GlyphData,
        corners: THREE.Vector3[],
        weight: number,
        bgWeight: number,
        mirrored: boolean,
        style: TextRenderStyle
    ): void {
        for (let i = 0; i < VERTICES_PER_QUAD; ++i) {
            const vertexOffset = offset + VERTEX_BUFFER_STRIDE * i;
            buffer[vertexOffset] = corners[i].x;
            buffer[vertexOffset + 1] = corners[i].y;
            buffer[vertexOffset + 2] = corners[i].z;
            buffer[vertexOffset + 3] = (mirrored ? -1.0 : 1.0) * style.rotation;

            const mirroredUVIdx = mirrored ? ((i + 1) % 2) + Math.floor(i / 2) * 2 : i;
            buffer[vertexOffset + 4] = glyphData.dynamicTextureCoordinates[mirroredUVIdx].x;
            buffer[vertexOffset + 5] = glyphData.dynamicTextureCoordinates[mirroredUVIdx].y;
            buffer[vertexOffset + 6] = weight;
            buffer[vertexOffset + 7] = bgWeight;

            buffer[vertexOffset + 8] = style.color.r;
            buffer[vertexOffset + 9] = style.color.g;
            buffer[vertexOffset + 10] = style.color.b;
            buffer[vertexOffset + 11] = style.opacity;

            buffer[vertexOffset + 12] = style.backgroundColor.r;
            buffer[vertexOffset + 13] = style.backgroundColor.g;
            buffer[vertexOffset + 14] = style.backgroundColor.b;
            buffer[vertexOffset + 15] = style.backgroundOpacity;
        }
    }

    /**
     * Add a previously computed [[TextBufferObject]] to the `TextGeometry`. Extra parameters can
     * be passed to override the passed attribute data.
     *
     * @param textBufferObject - [[TextBufferObject]] containing computed glyphs.
     * @param position - Override position value.
     * @param scale - Override scale value.
     * @param rotation - Override rotation value.
     * @param color - Override color value.
     * @param opacity - Override opacity value.
     * @param bgColor - Override background color value.
     * @param bgOpacity - Override background opacity value.
     *
     * @returns Result of the addition.
     */
    addTextBufferObject(
        textBufferObject: TextBufferObject,
        position?: THREE.Vector3,
        scale?: number,
        rotation?: number,
        color?: THREE.Color,
        opacity?: number,
        bgColor?: THREE.Color,
        bgOpacity?: number
    ): boolean {
        if (this.m_drawCount + textBufferObject.glyphs.length >= this.capacity) {
            return false;
        } else if (this.m_drawCount + textBufferObject.glyphs.length >= this.m_currentCapacity) {
            const newSize = Math.min(this.m_currentCapacity * 2, this.capacity);
            this.resizeBuffers(newSize);
        }

        const s = scale ?? 1.0;
        const r = rotation ?? 0.0;
        const cosR = Math.cos(r);
        const sinR = Math.sin(r);
        const offsetX = position !== undefined ? position.x : 0.0;
        const offsetY = position !== undefined ? position.y : 0.0;
        // Ignore z for rendering
        const offsetZ = 0.0;

        const buffer = textBufferObject.buffer;

        const rot = buffer[3];
        const rotSign = rot < 0 ? -1.0 : 1.0;

        const red = color !== undefined ? color.r : buffer[8];
        const green = color !== undefined ? color.g : buffer[9];
        const blue = color !== undefined ? color.b : buffer[10];
        const alpha = opacity !== undefined ? opacity : buffer[11];
        const bgRed = bgColor !== undefined ? bgColor.r : buffer[12];
        const bgGreen = bgColor !== undefined ? bgColor.g : buffer[13];
        const bgBlue = bgColor !== undefined ? bgColor.b : buffer[14];
        const bgAlpha = bgOpacity !== undefined ? bgOpacity : buffer[15];

        const targetOffset = this.m_drawCount * VERTICES_PER_QUAD;
        for (let i = 0; i < textBufferObject.glyphs.length; ++i) {
            const srcOffset = i * QUAD_VERTEX_MEMORY_FOOTPRINT;

            const glyph = textBufferObject.glyphs[i];
            if (!glyph.isInCache) {
                return false;
            }

            const mirrored = buffer[srcOffset + 4] > buffer[srcOffset + VERTEX_BUFFER_STRIDE + 4];
            const w = buffer[srcOffset + 6];
            const bw = buffer[srcOffset + 7];

            for (let j = 0; j < VERTICES_PER_QUAD; ++j) {
                const x = buffer[srcOffset + j * VERTEX_BUFFER_STRIDE];
                const y = buffer[srcOffset + j * VERTEX_BUFFER_STRIDE + 1];
                this.m_positionAttribute.setXYZW(
                    targetOffset + i * VERTICES_PER_QUAD + j,
                    x * s * cosR + y * s * -sinR + offsetX,
                    x * s * sinR + y * s * cosR + offsetY,
                    buffer[srcOffset + j * VERTEX_BUFFER_STRIDE + 2] + offsetZ,
                    buffer[srcOffset + j * VERTEX_BUFFER_STRIDE + 3] + rotSign * r
                );
                const mirroredUVIdx = mirrored ? ((j + 1) % 2) + Math.floor(j / 2) * 2 : j;
                this.m_uvAttribute.setXYZW(
                    targetOffset + i * VERTICES_PER_QUAD + j,
                    glyph.dynamicTextureCoordinates[mirroredUVIdx].x,
                    glyph.dynamicTextureCoordinates[mirroredUVIdx].y,
                    w,
                    (bw - w) / s + w
                );
                this.m_colorAttribute.setXYZW(
                    targetOffset + i * VERTICES_PER_QUAD + j,
                    red,
                    green,
                    blue,
                    alpha
                );
                this.m_bgColorAttribute.setXYZW(
                    targetOffset + i * VERTICES_PER_QUAD + j,
                    bgRed,
                    bgGreen,
                    bgBlue,
                    bgAlpha
                );
            }

            this.m_indexBuffer.setX(
                (this.m_drawCount + i) * INDICES_PER_QUAD,
                (this.m_drawCount + i) * VERTICES_PER_QUAD
            );
            this.m_indexBuffer.setX(
                (this.m_drawCount + i) * INDICES_PER_QUAD + 1,
                (this.m_drawCount + i) * VERTICES_PER_QUAD + 1
            );
            this.m_indexBuffer.setX(
                (this.m_drawCount + i) * INDICES_PER_QUAD + 2,
                (this.m_drawCount + i) * VERTICES_PER_QUAD + 2
            );
            this.m_indexBuffer.setX(
                (this.m_drawCount + i) * INDICES_PER_QUAD + 3,
                (this.m_drawCount + i) * VERTICES_PER_QUAD + 2
            );
            this.m_indexBuffer.setX(
                (this.m_drawCount + i) * INDICES_PER_QUAD + 4,
                (this.m_drawCount + i) * VERTICES_PER_QUAD + 1
            );
            this.m_indexBuffer.setX(
                (this.m_drawCount + i) * INDICES_PER_QUAD + 5,
                (this.m_drawCount + i) * VERTICES_PER_QUAD + 3
            );
        }

        this.m_drawCount += textBufferObject.glyphs.length;
        return true;
    }

    /**
     * Adds picking data for glyphs from the specified start until the last glyph added.
     *
     * @param startIdx - First glyph index that this picking data is associated to.
     * @param endIdx - Last glyph index that this picking data is associated to.
     * @param pickingData - Picking data to be added.
     */
    addPickingData(startIdx: number, endIdx: number, pickingData: any): boolean {
        if (this.m_pickingDataArray.length >= this.m_currentCapacity) {
            return false;
        }

        this.m_pickingDataArray.push({
            start: Math.min(startIdx, this.capacity),
            end: Math.min(endIdx, this.capacity),
            data: pickingData
        });

        return true;
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple glyphs
     * are found, the order of the results is unspecified.
     *
     * @param screenPosition - Screen coordinate of picking position.
     * @param pickCallback - Callback to be called for every picked element.
     */
    pick(screenPosition: THREE.Vector2, pickCallback: (pickData: any | undefined) => void) {
        for (const pickingData of this.m_pickingDataArray) {
            if (pickingData === undefined) {
                return;
            }

            for (let i = pickingData.start; i < pickingData.end; ++i) {
                const positionIndex = i * VERTICES_PER_QUAD;

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

    /**
     * Update the info with the memory footprint caused by objects owned by the `TextGeometry`.
     *
     * @param info - The info object to increment with the values from this `TextGeometry`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        const numBytes =
            this.m_vertexBuffer.count * NUM_BYTES_PER_FLOAT +
            this.m_indexBuffer.count * NUM_BYTES_PER_INT32;
        info.heapSize += numBytes;
        info.gpuSize += numBytes;
    }

    private resizeBuffers(size: number) {
        this.m_currentCapacity = size;

        const newVertexBuffer = new Float32Array(size * QUAD_VERTEX_MEMORY_FOOTPRINT);
        newVertexBuffer.set(this.m_vertexBuffer.array);
        this.m_vertexBuffer = new THREE.InterleavedBuffer(newVertexBuffer, VERTEX_BUFFER_STRIDE);
        this.m_vertexBuffer.setUsage(THREE.DynamicDrawUsage);
        this.m_positionAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 0);
        this.m_uvAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 4);
        this.m_colorAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 8);
        this.m_bgColorAttribute = new THREE.InterleavedBufferAttribute(this.m_vertexBuffer, 4, 12);

        const newIndexBuffer = new Uint32Array(size * QUAD_INDEX_MEMORY_FOOTPRINT);
        newIndexBuffer.set(this.m_indexBuffer.array);
        this.m_indexBuffer = new THREE.BufferAttribute(newIndexBuffer, INDEX_BUFFER_STRIDE);
        this.m_indexBuffer.setUsage(THREE.DynamicDrawUsage);

        this.m_geometry.dispose();
        this.m_geometry = new THREE.BufferGeometry();
        this.m_geometry.setAttribute("position", this.m_positionAttribute);
        this.m_geometry.setAttribute("uv", this.m_uvAttribute);
        this.m_geometry.setAttribute("color", this.m_colorAttribute);
        this.m_geometry.setAttribute("bgColor", this.m_bgColorAttribute);
        this.m_geometry.setIndex(this.m_indexBuffer);

        this.m_pickingDataArray.length = this.m_currentCapacity;

        this.scene.remove(this.m_bgMesh, this.m_mesh);
        this.m_mesh = new THREE.Mesh(this.m_geometry, this.m_mesh.material);
        this.m_bgMesh = new THREE.Mesh(this.m_geometry, this.m_bgMesh.material);
        this.m_mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        this.m_bgMesh.renderOrder = Number.MAX_SAFE_INTEGER - 1;
        this.m_mesh.frustumCulled = false;
        this.m_bgMesh.frustumCulled = false;
        this.scene.add(this.m_bgMesh, this.m_mesh);
    }
}
