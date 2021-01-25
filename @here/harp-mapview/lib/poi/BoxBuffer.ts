/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MemoryUsage } from "@here/harp-text-canvas";
import { Math2D } from "@here/harp-utils";
import * as THREE from "three";

import { getPixelFromImage, screenToUvCoordinates } from "./PixelPicker";

/**
 * Declares an interface for a `struct` containing a [[BoxBuffer]]'s attribute state information.
 */
export interface State {
    positionAttributeCount: number;
    colorAttributeCount: number;
    uvAttributeCount: number;
    indexAttributeCount: number;
    pickInfoCount: number;
}

/**
 * Initial number of boxes in BoxBuffer.
 */
const START_BOX_BUFFER_SIZE = 0;

/**
 * Maximum number of boxes in BoxBuffer.
 */
const MAX_BOX_BUFFER_SIZE = 32 * 1024;

/**
 * Number of vertices per box/glyph element: 4 corners.
 */
const NUM_VERTICES_PER_ELEMENT = 4;

/**
 * Number of indices added per box/glyph: 2 triangles, 6 indices.
 */
const NUM_INDICES_PER_ELEMENT = 6;

/**
 * Number of values per position.
 */
const NUM_POSITION_VALUES_PER_VERTEX = 3;

/**
 * Number of values per color.
 */
const NUM_COLOR_VALUES_PER_VERTEX = 4;

/**
 * Number of values per UV.
 */
const NUM_UV_VALUES_PER_VERTEX = 4;

/**
 * Number of values per index.
 */
const NUM_INDEX_VALUES_PER_VERTEX = 1;

/**
 * Number of bytes for float in an Float32Array.
 */
const NUM_BYTES_PER_FLOAT = 4;

/**
 * Number of bytes for integer number in an UInt32Array.
 */
const NUM_BYTES_PER_INT32 = 4;

/**
 * SubClass of [[THREE.Mesh]] to identify meshes that have been created by [[BoxBuffer]] and
 * [[TextBuffer]]. Add the isEmpty flag to quickly test for empty meshes.
 */
export class BoxBufferMesh extends THREE.Mesh {
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) {
        super(geometry, material);

        this.type = "BoxBufferMesh";
    }

    /**
     * A mesh that has no positions and indices set is defined to be empty.
     *
     * @returns `True` if no indices have been added to the mesh.
     */
    get isEmpty(): boolean {
        if (this.geometry === undefined) {
            return true;
        } else {
            const bufferGeometry = this.geometry as THREE.BufferGeometry;
            return bufferGeometry.index === null || bufferGeometry.index.count === 0;
        }
    }
}

/**
 * Buffer for (untransformed) `Box2` objects. Can be used to create a single geometry for screen-
 * aligned boxes, like POIs.
 */
export class BoxBuffer {
    /**
     * {@link @here/harp-datasource-protocol#BufferAttribute} holding the `BoxBuffer` position data.
     */
    private m_positionAttribute?: THREE.BufferAttribute;

    /**
     * {@link @here/harp-datasource-protocol#BufferAttribute} holding the `BoxBuffer` color data.
     */
    private m_colorAttribute?: THREE.BufferAttribute;

    /**
     * {@link @here/harp-datasource-protocol#BufferAttribute} holding the `BoxBuffer` uv data.
     */
    private m_uvAttribute?: THREE.BufferAttribute;

    /**
     * {@link @here/harp-datasource-protocol#BufferAttribute} holding the `BoxBuffer` index data.
     */
    private m_indexAttribute?: THREE.BufferAttribute;
    private readonly m_pickInfos: Array<any | undefined>;

    /**
     * [[BufferGeometry]] holding all the different
     * {@link @here/harp-datasource-protocol#BufferAttribute}s.
     */
    private m_geometry: THREE.BufferGeometry | undefined;

    /**
     * [[Mesh]] used for rendering.
     */
    private m_mesh: BoxBufferMesh | undefined;

    private m_size: number = 0;

    /**
     * Creates a new `BoxBuffer`.
     *
     * @param m_material - Material to be used for [[Mesh]] of this `BoxBuffer`.
     * @param m_renderOrder - Optional renderOrder of this buffer.
     * @param startElementCount - Initial number of elements this `BoxBuffer` can hold.
     * @param m_maxElementCount - Maximum number of elements this `BoxBuffer` can hold.
     */
    constructor(
        private readonly m_material: THREE.Material | THREE.Material[],
        private readonly m_renderOrder: number = 0,
        startElementCount = START_BOX_BUFFER_SIZE,
        private readonly m_maxElementCount = MAX_BOX_BUFFER_SIZE
    ) {
        this.resizeBuffer(startElementCount);
        this.m_pickInfos = new Array();
    }

    /**
     * Duplicate this `BoxBuffer` with same material and renderOrder.
     *
     * @returns A clone of this `BoxBuffer`.
     */
    clone(): BoxBuffer {
        return new BoxBuffer(this.m_material, this.m_renderOrder);
    }

    /**
     * Dispose of the geometry.
     */
    dispose() {
        if (this.m_geometry !== undefined) {
            this.m_geometry.dispose();
            this.m_geometry = undefined;
        }
        this.m_mesh = undefined;
    }

    /**
     * Return the current number of elements the buffer can hold.
     */
    get size(): number {
        return this.m_size;
    }

    /**
     * Clear's the `BoxBuffer` attribute buffers.
     */
    reset() {
        if (this.m_positionAttribute !== undefined) {
            this.m_positionAttribute.count = 0;
            this.m_colorAttribute!.count = 0;
            this.m_uvAttribute!.count = 0;
            this.m_indexAttribute!.count = 0;
            this.m_pickInfos!.length = 0;
        }
    }

    /**
     * Returns `true` if this `BoxBuffer` can hold the specified amount of glyphs. If the buffer
     * can only add the glyph by increasing the buffer size, the resize() method is called, which
     * will then create a new geometry for the mesh.
     *
     * @param glyphCount - Number of glyphs to be added to the buffer.
     * @returns `true` if the element (box or glyph) can be added to the buffer, `false` otherwise.
     */
    canAddElements(glyphCount = 1): boolean {
        const indexAttribute = this.m_indexAttribute!;
        if (
            indexAttribute.count + glyphCount * NUM_INDICES_PER_ELEMENT >=
            indexAttribute.array.length
        ) {
            // Too many elements for the current buffer, check if we can resize the buffer.
            if (indexAttribute.array.length >= this.m_maxElementCount * NUM_INDICES_PER_ELEMENT) {
                return false;
            }

            const newSize = Math.min(this.m_maxElementCount, this.size === 0 ? 256 : this.size * 2);
            this.resize(newSize);
        }
        return true;
    }

    /**
     * Returns this `BoxBuffer`'s attribute [[State]].
     */
    saveState(): State {
        const state: State = {
            positionAttributeCount: this.m_positionAttribute!.count,
            colorAttributeCount: this.m_colorAttribute!.count,
            uvAttributeCount: this.m_uvAttribute!.count,
            indexAttributeCount: this.m_indexAttribute!.count,
            pickInfoCount: this.m_pickInfos!.length
        };
        return state;
    }

    /**
     * Store this `BoxBuffer`'s attribute [[State]] to a previously stored one.
     *
     * @param state - [[State]] struct describing a previous attribute state.
     */
    restoreState(state: State) {
        this.m_positionAttribute!.count = state.positionAttributeCount;
        this.m_colorAttribute!.count = state.colorAttributeCount;
        this.m_uvAttribute!.count = state.uvAttributeCount;
        this.m_indexAttribute!.count = state.indexAttributeCount;
        this.m_pickInfos!.length = state.pickInfoCount;
    }

    /**
     * Adds a new box to this `BoxBuffer`.
     *
     * @param screenBox - [[Math2D.Box]] holding screen coordinates for this box.
     * @param uvBox - [[Math2D.UvBox]] holding uv coordinates for this box.
     * @param color - Box's color.
     * @param opacity - Box's opacity.
     * @param distance - Box's distance to camera.
     * @param pickInfo - Box's picking information.
     */
    addBox(
        screenBox: Math2D.Box,
        uvBox: Math2D.UvBox,
        color: THREE.Color,
        opacity: number,
        distance: number,
        pickInfo?: any
    ): boolean {
        if (!this.canAddElements()) {
            return false;
        }

        const { s0, t0, s1, t1 } = uvBox;
        const { x, y, w, h } = screenBox;

        // Premultiply alpha into vertex colors
        const r = Math.round(color.r * opacity * 255);
        const g = Math.round(color.g * opacity * 255);
        const b = Math.round(color.b * opacity * 255);
        const a = Math.round(opacity * 255);

        const positionAttribute = this.m_positionAttribute!;
        const colorAttribute = this.m_colorAttribute!;
        const uvAttribute = this.m_uvAttribute!;
        const indexAttribute = this.m_indexAttribute!;

        const baseVertex = positionAttribute.count;
        const baseIndex = indexAttribute.count;

        positionAttribute.setXYZ(baseVertex, x, y, distance);
        positionAttribute.setXYZ(baseVertex + 1, x + w, y, distance);
        positionAttribute.setXYZ(baseVertex + 2, x, y + h, distance);
        positionAttribute.setXYZ(baseVertex + 3, x + w, y + h, distance);

        colorAttribute.setXYZW(baseVertex, r, g, b, a);
        colorAttribute.setXYZW(baseVertex + 1, r, g, b, a);
        colorAttribute.setXYZW(baseVertex + 2, r, g, b, a);
        colorAttribute.setXYZW(baseVertex + 3, r, g, b, a);

        uvAttribute.setXY(baseVertex, s0, t0);
        uvAttribute.setXY(baseVertex + 1, s1, t0);
        uvAttribute.setXY(baseVertex + 2, s0, t1);
        uvAttribute.setXY(baseVertex + 3, s1, t1);

        indexAttribute.setX(baseIndex, baseVertex);
        indexAttribute.setX(baseIndex + 1, baseVertex + 1);
        indexAttribute.setX(baseIndex + 2, baseVertex + 2);
        indexAttribute.setX(baseIndex + 3, baseVertex + 2);
        indexAttribute.setX(baseIndex + 4, baseVertex + 1);
        indexAttribute.setX(baseIndex + 5, baseVertex + 3);

        positionAttribute.count += NUM_VERTICES_PER_ELEMENT;
        colorAttribute.count += NUM_VERTICES_PER_ELEMENT;
        uvAttribute.count += NUM_VERTICES_PER_ELEMENT;
        indexAttribute.count += NUM_INDICES_PER_ELEMENT;

        this.m_pickInfos.push(pickInfo);

        return true;
    }

    /**
     * Updates a [[BufferGeometry]] object to reflect the changes in this `TextBuffer`'s attribute
     * data.
     */
    updateBufferGeometry() {
        const positionAttribute = this.m_positionAttribute!;
        const colorAttribute = this.m_colorAttribute!;
        const uvAttribute = this.m_uvAttribute!;
        const indexAttribute = this.m_indexAttribute!;

        if (positionAttribute.count > 0) {
            positionAttribute.needsUpdate = true;
            positionAttribute.updateRange.offset = 0;
            positionAttribute.updateRange.count =
                positionAttribute.count * NUM_VERTICES_PER_ELEMENT;
        }

        if (colorAttribute.count > 0) {
            colorAttribute.needsUpdate = true;
            colorAttribute.updateRange.offset = 0;
            colorAttribute.updateRange.count = colorAttribute.count * NUM_VERTICES_PER_ELEMENT;
        }

        if (uvAttribute.count > 0) {
            uvAttribute.needsUpdate = true;
            uvAttribute.updateRange.offset = 0;
            uvAttribute.updateRange.count = uvAttribute.count * NUM_VERTICES_PER_ELEMENT;
        }

        if (indexAttribute.count > 0) {
            indexAttribute.needsUpdate = true;
            indexAttribute.updateRange.offset = 0;
            indexAttribute.updateRange.count = indexAttribute.count;
        }

        if (this.m_geometry !== undefined) {
            this.m_geometry.clearGroups();
            this.m_geometry.addGroup(0, this.m_indexAttribute!.count);
        }
    }

    /**
     * Check if the buffer is empty. If it is empty, the memory usage is minimized to reduce
     * footprint.
     */
    cleanUp() {
        // If there is nothing in this buffer, resize it, it may never be used again.
        if (this.m_indexAttribute!.count === 0 && this.size > START_BOX_BUFFER_SIZE) {
            this.clearAttributes();
        }
    }

    /**
     * Determine if the mesh is empty.
     */
    get isEmpty(): boolean {
        return this.m_mesh!.isEmpty;
    }

    /**
     * Get the [[Mesh]] object. The geometry instance of the mesh may change if the buffers are
     * resized. The mesh, once created, will not change, so it can always be added to the scene.
     */
    get mesh(): BoxBufferMesh {
        if (this.m_mesh === undefined) {
            this.resize();
        }
        return this.m_mesh!;
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * boxes are found, the order of the results is unspecified.
     *
     * @param screenPosition - Screen coordinate of picking position.
     * @param pickCallback - Callback to be called for every picked element.
     * @param image - Image to test if the pixel is transparent
     */
    pickBoxes(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void,
        image?: CanvasImageSource | ImageData
    ) {
        const n = this.m_pickInfos.length;
        const pickInfos = this.m_pickInfos;
        const positions = this.m_positionAttribute!;
        const screenX = screenPosition.x;
        const screenY = screenPosition.y;

        for (let pickInfoIndex = 0; pickInfoIndex < n; pickInfoIndex++) {
            const positionIndex = pickInfoIndex * NUM_VERTICES_PER_ELEMENT;

            const minX = positions.getX(positionIndex);
            if (screenX < minX) {
                continue;
            }

            const maxX = positions.getX(positionIndex + 1);
            if (screenX > maxX) {
                continue;
            }

            const minY = positions.getY(positionIndex);
            if (screenY < minY) {
                continue;
            }

            const maxY = positions.getY(positionIndex + 2);
            if (screenY > maxY) {
                continue;
            }

            const box = new Math2D.Box(minX, minY, maxX - minX, maxY - minY);
            if (
                image !== undefined &&
                pickInfos[pickInfoIndex].poiInfo !== undefined &&
                pickInfos[pickInfoIndex].poiInfo.uvBox !== undefined &&
                this.isPixelTransparent(
                    image,
                    screenX,
                    screenY,
                    box,
                    pickInfos[pickInfoIndex].poiInfo.uvBox,
                    document.createElement("canvas")
                )
            ) {
                continue;
            }

            if (pickInfos[pickInfoIndex] !== undefined) {
                pickCallback(pickInfos[pickInfoIndex]);
            }
        }
    }

    /**
     * Creates a new {@link @here/harp-datasource-protocol#Geometry} object
     * from all the attribute data stored in this `BoxBuffer`.
     *
     * @remarks
     * The [[Mesh]] object may be created if it is not initialized already.
     *
     * @param newSize - Optional number of elements to resize the buffer to.
     * @param forceResize - Optional flag to force a resize even if new size is smaller than before.
     */
    resize(newSize?: number, forceResize?: boolean): BoxBufferMesh {
        if (this.m_geometry !== undefined) {
            this.m_geometry.dispose();
        }

        this.m_geometry = new THREE.BufferGeometry();

        if (newSize !== undefined && (forceResize === true || newSize > this.size)) {
            this.resizeBuffer(newSize);
        }

        this.m_geometry.setAttribute("position", this.m_positionAttribute!);
        this.m_geometry.setAttribute("color", this.m_colorAttribute!);
        this.m_geometry.setAttribute("uv", this.m_uvAttribute!);
        this.m_geometry.setIndex(this.m_indexAttribute!);
        this.m_geometry.addGroup(0, this.m_indexAttribute!.count);

        if (this.m_mesh === undefined) {
            this.m_mesh = new BoxBufferMesh(this.m_geometry, this.m_material);
            this.m_mesh.renderOrder = this.m_renderOrder;
        } else {
            this.m_mesh.geometry = this.m_geometry;
        }
        return this.m_mesh;
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `BoxBuffer`.
     *
     * @param info - The info object to increment with the values from this `BoxBuffer`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        const numBytes =
            this.m_positionAttribute!.count * NUM_POSITION_VALUES_PER_VERTEX * NUM_BYTES_PER_FLOAT +
            this.m_colorAttribute!.count * NUM_COLOR_VALUES_PER_VERTEX +
            this.m_uvAttribute!.count * NUM_UV_VALUES_PER_VERTEX * NUM_BYTES_PER_FLOAT +
            this.m_indexAttribute!.count * NUM_BYTES_PER_INT32; // May be UInt16, so we overestimate

        info.heapSize += numBytes;
        info.gpuSize += numBytes;
    }

    /**
     * Check if a pixel is transparent or not.
     *
     * @param image - Image source.
     * @param xScreenPos - X position of the pixel.
     * @param yScreenPos - Y position of the pixel.
     * @param box - Bounding box of the image in screen coordinates.
     * @param uvBox - Uv box referred to the given bounding box.
     * @param canvas - Canvas element to draw the image if it's not a `ImageData` object.
     */
    private isPixelTransparent(
        image: CanvasImageSource | ImageData,
        xScreenPos: number,
        yScreenPos: number,
        box: Math2D.Box,
        uvBox: Math2D.UvBox,
        canvas?: HTMLCanvasElement
    ): boolean {
        const { u, v } = screenToUvCoordinates(xScreenPos, yScreenPos, box, uvBox);
        const { width, height } = image instanceof SVGImageElement ? image.getBBox() : image;
        const x = width * u;
        const y = height * v;

        const pixel = getPixelFromImage(x, y, image, canvas);

        return pixel !== undefined && pixel[3] === 0;
    }

    /**
     * Remove current attributes and arrays. Minimizes memory footprint.
     */
    private clearAttributes() {
        this.m_positionAttribute = undefined;
        this.m_colorAttribute = undefined;
        this.m_uvAttribute = undefined;
        this.m_indexAttribute = undefined;
        this.resize(START_BOX_BUFFER_SIZE, true);
    }

    /**
     * Resize the attribute buffers. New value must be larger than the previous one.
     *
     * @param newSize - New number of elements in the buffer. Number has to be larger than the
     *      previous size.
     */
    private resizeBuffer(newSize: number) {
        const newPositionArray = new Float32Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_POSITION_VALUES_PER_VERTEX
        );

        if (this.m_positionAttribute !== undefined && this.m_positionAttribute.array.length > 0) {
            const positionAttributeCount = this.m_positionAttribute.count;
            newPositionArray.set(this.m_positionAttribute.array);
            this.m_positionAttribute.array = newPositionArray;
            this.m_positionAttribute.count = positionAttributeCount;
        } else {
            this.m_positionAttribute = new THREE.BufferAttribute(
                newPositionArray,
                NUM_POSITION_VALUES_PER_VERTEX
            );
            this.m_positionAttribute.count = 0;
            this.m_positionAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        const newColorArray = new Uint8Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_COLOR_VALUES_PER_VERTEX
        );

        if (this.m_colorAttribute !== undefined) {
            const colorAttributeCount = this.m_colorAttribute.count;
            newColorArray.set(this.m_colorAttribute.array);
            this.m_colorAttribute.array = newColorArray;
            this.m_colorAttribute.count = colorAttributeCount;
        } else {
            this.m_colorAttribute = new THREE.BufferAttribute(
                newColorArray,
                NUM_COLOR_VALUES_PER_VERTEX,
                true
            );
            this.m_colorAttribute.count = 0;
            this.m_colorAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        const newUvArray = new Float32Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_UV_VALUES_PER_VERTEX
        );

        if (this.m_uvAttribute !== undefined) {
            const uvAttributeCount = this.m_uvAttribute.count;
            newUvArray.set(this.m_uvAttribute.array);
            this.m_uvAttribute.array = newUvArray;
            this.m_uvAttribute.count = uvAttributeCount;
        } else {
            this.m_uvAttribute = new THREE.BufferAttribute(newUvArray, NUM_UV_VALUES_PER_VERTEX);
            this.m_uvAttribute.count = 0;
            this.m_uvAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        const numIndexValues = newSize * NUM_INDICES_PER_ELEMENT * NUM_INDEX_VALUES_PER_VERTEX;

        const newIndexArray =
            numIndexValues > 65535
                ? new Uint32Array(numIndexValues)
                : new Uint16Array(numIndexValues);

        if (this.m_indexAttribute !== undefined) {
            const indexAttributeCount = this.m_indexAttribute.count;
            newIndexArray.set(this.m_indexAttribute.array);
            this.m_indexAttribute.array = newIndexArray;
            this.m_indexAttribute.count = indexAttributeCount;
        } else {
            this.m_indexAttribute = new THREE.BufferAttribute(
                newIndexArray,
                NUM_INDEX_VALUES_PER_VERTEX
            );
            this.m_indexAttribute.count = 0;
            this.m_indexAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        this.m_size = newSize;
    }
}
