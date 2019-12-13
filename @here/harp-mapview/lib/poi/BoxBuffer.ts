/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Math2D } from "@here/harp-utils";
import * as THREE from "three";

import { MemoryUsage } from "@here/harp-text-canvas";
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
     * [[BufferAttribute]] holding the `BoxBuffer` position data.
     */
    protected positionAttribute?: THREE.BufferAttribute;

    /**
     * [[BufferAttribute]] holding the `BoxBuffer` color data.
     */
    protected colorAttribute?: THREE.BufferAttribute;

    /**
     * [[BufferAttribute]] holding the `BoxBuffer` uv data.
     */
    protected uvAttribute?: THREE.BufferAttribute;

    /**
     * [[BufferAttribute]] holding the `BoxBuffer` index data.
     */
    protected indexAttribute?: THREE.BufferAttribute;
    protected pickInfos: Array<any | undefined>;

    /**
     * [[BufferGeometry]] holding all the different [[BufferAttribute]]s.
     */
    protected geometry: THREE.BufferGeometry | undefined;

    /**
     * [[Mesh]] used for rendering.
     */
    protected internalMesh: BoxBufferMesh | undefined;

    private m_size: number = 0;

    /**
     * Creates a new `BoxBuffer`.
     *
     * @param material Material to be used for [[Mesh]] of this `BoxBuffer`.
     * @param renderOrder Optional renderOrder of this buffer.
     * @param startElementCount Initial number of elements this `BoxBuffer` can hold.
     * @param maxElementCount Maximum number of elements this `BoxBuffer` can hold.
     */
    constructor(
        readonly material: THREE.Material | THREE.Material[],
        readonly renderOrder: number = 0,
        readonly startElementCount = START_BOX_BUFFER_SIZE,
        readonly maxElementCount = MAX_BOX_BUFFER_SIZE
    ) {
        this.resizeBuffer(startElementCount);
        this.pickInfos = new Array();
    }

    /**
     * Duplicate this `BoxBuffer` with same material and renderOrder.
     *
     * @returns A clone of this `BoxBuffer`.
     */
    clone(): BoxBuffer {
        return new BoxBuffer(this.material, this.renderOrder);
    }

    /**
     * Dispose of the geometry.
     */
    dispose() {
        if (this.geometry !== undefined) {
            this.geometry.dispose();
            this.geometry = undefined;
        }
        this.internalMesh = undefined;
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
        if (this.positionAttribute !== undefined) {
            this.positionAttribute.count = 0;
            this.colorAttribute!.count = 0;
            this.uvAttribute!.count = 0;
            this.indexAttribute!.count = 0;
            this.pickInfos!.length = 0;
        }
    }

    /**
     * Returns `true` if this `BoxBuffer` can hold the specified amount of glyphs. If the buffer
     * can only add the glyph by increasing the buffer size, the resize() method is called, which
     * will then create a new geometry for the mesh.
     *
     * @param glyphCount Number of glyphs to be added to the buffer.
     * @returns `true` if the element (box or glyph) can be added to the buffer, `false` otherwise.
     */
    canAddElements(glyphCount = 1): boolean {
        const indexAttribute = this.indexAttribute!;
        if (
            indexAttribute.count + glyphCount * NUM_INDICES_PER_ELEMENT >=
            indexAttribute.array.length
        ) {
            // Too many elements for the current buffer, check if we can resize the buffer.
            if (indexAttribute.array.length >= this.maxElementCount * NUM_INDICES_PER_ELEMENT) {
                return false;
            }

            const newSize = Math.min(this.maxElementCount, this.size === 0 ? 256 : this.size * 2);
            this.resize(newSize);
        }
        return true;
    }

    /**
     * Returns this `BoxBuffer`'s attribute [[State]].
     */
    saveState(): State {
        const state: State = {
            positionAttributeCount: this.positionAttribute!.count,
            colorAttributeCount: this.colorAttribute!.count,
            uvAttributeCount: this.uvAttribute!.count,
            indexAttributeCount: this.indexAttribute!.count,
            pickInfoCount: this.pickInfos!.length
        };
        return state;
    }

    /**
     * Store this `BoxBuffer`'s attribute [[State]] to a previously stored one.
     *
     * @param state [[State]] struct describing a previous attribute state.
     */
    restoreState(state: State) {
        this.positionAttribute!.count = state.positionAttributeCount;
        this.colorAttribute!.count = state.colorAttributeCount;
        this.uvAttribute!.count = state.uvAttributeCount;
        this.indexAttribute!.count = state.indexAttributeCount;
        this.pickInfos!.length = state.pickInfoCount;
    }

    /**
     * Adds a new box to this `BoxBuffer`.
     *
     * @param screenBox [[Math2D.Box]] holding screen coordinates for this box.
     * @param uvBox [[Math2D.UvBox]] holding uv coordinates for this box.
     * @param color Box's color.
     * @param opacity Box's opacity.
     * @param distance Box's distance to camera.
     * @param pickInfo Box's picking information.
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

        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        const a = Math.round(opacity * 255);

        const positionAttribute = this.positionAttribute!;
        const colorAttribute = this.colorAttribute!;
        const uvAttribute = this.uvAttribute!;
        const indexAttribute = this.indexAttribute!;

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

        this.pickInfos.push(pickInfo);

        return true;
    }

    /**
     * Updates a [[BufferGeometry]] object to reflect the changes in this `TextBuffer`'s attribute
     * data.
     */
    updateBufferGeometry() {
        const positionAttribute = this.positionAttribute!;
        const colorAttribute = this.colorAttribute!;
        const uvAttribute = this.uvAttribute!;
        const indexAttribute = this.indexAttribute!;

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

        if (this.geometry !== undefined) {
            this.geometry.clearGroups();
            this.geometry.addGroup(0, this.indexAttribute!.count);
        }
    }

    /**
     * Check if the buffer is empty. If it is empty, the memory usage is minimized to reduce
     * footprint.
     */
    cleanUp() {
        // If there is nothing in this buffer, resize it, it may never be used again.
        if (this.indexAttribute!.count === 0 && this.size > START_BOX_BUFFER_SIZE) {
            this.clearAttributes();
        }
    }

    /**
     * Determine if the mesh is empty.
     */
    get isEmpty(): boolean {
        return this.internalMesh!.isEmpty;
    }

    /**
     * Get the [[Mesh]] object. The geometry instance of the mesh may change if the buffers are
     * resized. The mesh, once created, will not change, so it can always be added to the scene.
     */
    get mesh(): BoxBufferMesh {
        if (this.internalMesh === undefined) {
            this.resize();
        }
        return this.internalMesh!;
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * boxes are found, the order of the results is unspecified.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     * @param imageData Image data to test if the pixel is transparent
     */
    pickBoxes(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void,
        imageData?: ImageBitmap | ImageData
    ) {
        const n = this.pickInfos.length;
        const pickInfos = this.pickInfos;
        const positions = this.positionAttribute!;
        const screenX = screenPosition.x;
        const screenY = screenPosition.y;

        const canvas = document.createElement("canvas");
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
                imageData !== undefined &&
                pickInfos[pickInfoIndex].poiInfo !== undefined &&
                pickInfos[pickInfoIndex].poiInfo.uvBox !== undefined &&
                this.isPixelTransparent(
                    imageData,
                    screenX,
                    screenY,
                    box,
                    pickInfos[pickInfoIndex].poiInfo.uvBox,
                    canvas
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
     * Creates a new [[Geometry]] object from all the attribute data stored in this `BoxBuffer`.
     * The [[Mesh]] object may be created if it is not initialized already.
     *
     * @param newSize Optional number of elements to resize the buffer to.
     * @param forceResize Optional flag to force a resize even if new size is smaller than before.
     */
    resize(newSize?: number, forceResize?: boolean): BoxBufferMesh {
        if (this.geometry !== undefined) {
            this.geometry.dispose();
        }

        this.geometry = new THREE.BufferGeometry();

        if (newSize !== undefined && (forceResize === true || newSize > this.size)) {
            this.resizeBuffer(newSize);
        }

        this.geometry.setAttribute("position", this.positionAttribute!);
        this.geometry.setAttribute("color", this.colorAttribute!);
        this.geometry.setAttribute("uv", this.uvAttribute!);
        this.geometry.setIndex(this.indexAttribute!);
        this.geometry.addGroup(0, this.indexAttribute!.count);

        if (this.internalMesh === undefined) {
            this.internalMesh = new BoxBufferMesh(this.geometry, this.material);
            this.internalMesh.renderOrder = this.renderOrder;
        } else {
            this.internalMesh.geometry = this.geometry;
        }
        return this.internalMesh;
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `BoxBuffer`.
     *
     * @param info The info object to increment with the values from this `BoxBuffer`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        const numBytes =
            this.positionAttribute!.count * NUM_POSITION_VALUES_PER_VERTEX * NUM_BYTES_PER_FLOAT +
            this.colorAttribute!.count * NUM_COLOR_VALUES_PER_VERTEX +
            this.uvAttribute!.count * NUM_UV_VALUES_PER_VERTEX * NUM_BYTES_PER_FLOAT +
            this.indexAttribute!.count * NUM_BYTES_PER_INT32; // May be UInt16, so we overestimate

        info.heapSize += numBytes;
        info.gpuSize += numBytes;
    }

    /**
     * Check if a pixel is transparent or not.
     *
     * @param imageData Data containing the pixels.
     * @param xScreenPos X position of the pixel.
     * @param yScreenPos Y position of the pixel.
     * @param box Bounding box of the image in screen coordinates.
     * @param uvBox Uv box referred to the given bounding box.
     * @param canvas Canvas element that will be used to draw the image, in case the imageData is an
     *      ImageBitmap
     */
    protected isPixelTransparent(
        imageData: ImageBitmap | ImageData,
        xScreenPos: number,
        yScreenPos: number,
        box: Math2D.Box,
        uvBox: Math2D.UvBox,
        canvas?: HTMLCanvasElement
    ): boolean {
        let pixelIsTransparent = false;

        const { u, v } = screenToUvCoordinates(xScreenPos, yScreenPos, box, uvBox);

        const imageWidth = imageData.width;
        const x = imageWidth * u;
        const imageHeight = imageData.height;
        const y = imageHeight * v;

        const pixel = getPixelFromImage(x, y, imageData, canvas);

        if (pixel !== undefined && pixel[3] === 0) {
            pixelIsTransparent = true;
        }
        return pixelIsTransparent;
    }

    /**
     * Remove current attributes and arrays. Minimizes memory footprint.
     */
    protected clearAttributes() {
        this.positionAttribute = undefined;
        this.colorAttribute = undefined;
        this.uvAttribute = undefined;
        this.indexAttribute = undefined;
        this.resize(START_BOX_BUFFER_SIZE, true);
    }

    /**
     * Resize the attribute buffers. New value must be larger than the previous one.
     *
     * @param newSize New number of elements in the buffer. Number has to be larger than the
     *      previous size.
     */
    protected resizeBuffer(newSize: number) {
        const newPositionArray = new Float32Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_POSITION_VALUES_PER_VERTEX
        );

        if (this.positionAttribute !== undefined && this.positionAttribute.array.length > 0) {
            const positionAttributeCount = this.positionAttribute.count;
            newPositionArray.set(this.positionAttribute.array);
            this.positionAttribute.array = newPositionArray;
            this.positionAttribute.count = positionAttributeCount;
        } else {
            this.positionAttribute = new THREE.BufferAttribute(
                newPositionArray,
                NUM_POSITION_VALUES_PER_VERTEX
            );
            this.positionAttribute.count = 0;
            this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        const newColorArray = new Uint8Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_COLOR_VALUES_PER_VERTEX
        );

        if (this.colorAttribute !== undefined) {
            const colorAttributeCount = this.colorAttribute.count;
            newColorArray.set(this.colorAttribute.array);
            this.colorAttribute.array = newColorArray;
            this.colorAttribute.count = colorAttributeCount;
        } else {
            this.colorAttribute = new THREE.BufferAttribute(
                newColorArray,
                NUM_COLOR_VALUES_PER_VERTEX,
                true
            );
            this.colorAttribute.count = 0;
            this.colorAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        const newUvArray = new Float32Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_UV_VALUES_PER_VERTEX
        );

        if (this.uvAttribute !== undefined) {
            const uvAttributeCount = this.uvAttribute.count;
            newUvArray.set(this.uvAttribute.array);
            this.uvAttribute.array = newUvArray;
            this.uvAttribute.count = uvAttributeCount;
        } else {
            this.uvAttribute = new THREE.BufferAttribute(newUvArray, NUM_UV_VALUES_PER_VERTEX);
            this.uvAttribute.count = 0;
            this.uvAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        const numIndexValues = newSize * NUM_INDICES_PER_ELEMENT * NUM_INDEX_VALUES_PER_VERTEX;

        const newIndexArray =
            numIndexValues > 65535
                ? new Uint32Array(numIndexValues)
                : new Uint16Array(numIndexValues);

        if (this.indexAttribute !== undefined) {
            const indexAttributeCount = this.indexAttribute.count;
            newIndexArray.set(this.indexAttribute.array);
            this.indexAttribute.array = newIndexArray;
            this.indexAttribute.count = indexAttributeCount;
        } else {
            this.indexAttribute = new THREE.BufferAttribute(
                newIndexArray,
                NUM_INDEX_VALUES_PER_VERTEX
            );
            this.indexAttribute.count = 0;
            this.indexAttribute.setUsage(THREE.DynamicDrawUsage);
        }

        this.m_size = newSize;
    }
}
