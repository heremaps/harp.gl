/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { Math2D } from "@here/utils";
import * as THREE from "three";

import { FontCatalog, TextVerticalAlignment } from "./FontCatalog";
import { GlyphInfo } from "./Glyph";

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
 * Initial number of characters in TextBuffer.
 */
const START_TEXT_BUFFER_SIZE = 0;

/**
 * Maximum number of characters in TextBuffer.
 */
const MAX_TEXT_BUFFER_SIZE = 32 * 1024;

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
 * Number of glyph axis values per position.
 */
const NUM_GLYPH_AXIS_VALUES_PER_VERTEX = 2;

/**
 * Number of values per index.
 */
const NUM_INDEX_VALUES_PER_VERTEX = 1;

/**
 * Rendering mode of the text background elements.
 */
export enum TextBackgroundMode {
    Outline = 0.0,
    Glow = 1.0
}

/**
 * Rendering mode of the text background elements (string representation).
 */
export enum TextBackgroundModeStrings {
    Outline = "Outline",
    Glow = "Glow"
}

/**
 * SubClass of [[THREE.Mesh]] to identify meshes that have been created by [[BoxBuffer]] and
 * [[TextBuffer]]. Add the isEmpty flag to quickly test for empty meshes.
 */
export class BoxBufferMesh extends THREE.Mesh {
    constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
        super(geometry, material);

        this.type = "BoxBufferMesh";
    }

    /**
     * A mesh that has no positions and indices set is defined to be empty.
     *
     * @returns `True` if no indices have been added to the mesh.
     */
    get isEmpty(): boolean {
        return (this.geometry !== undefined)
            ? (this.geometry as THREE.BufferGeometry).index.count === 0
            : true;
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
        readonly material: THREE.Material,
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
     */
    pickBoxes(screenPosition: THREE.Vector2, pickCallback: (pickData: any | undefined) => void) {
        const n = this.pickInfos.length;
        const pickInfos = this.pickInfos;
        const positions = this.positionAttribute!;
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

        this.geometry.addAttribute("position", this.positionAttribute!);
        this.geometry.addAttribute("color", this.colorAttribute!);
        this.geometry.addAttribute("uv", this.uvAttribute!);
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
            this.positionAttribute.setArray(newPositionArray);
            this.positionAttribute.count = positionAttributeCount;
        } else {
            this.positionAttribute = new THREE.BufferAttribute(
                newPositionArray,
                NUM_POSITION_VALUES_PER_VERTEX
            );
            this.positionAttribute.count = 0;
            this.positionAttribute.setDynamic(true);
        }

        const newColorArray = new Uint8Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_COLOR_VALUES_PER_VERTEX
        );

        if (this.colorAttribute !== undefined) {
            const colorAttributeCount = this.colorAttribute.count;
            newColorArray.set(this.colorAttribute.array);
            this.colorAttribute.setArray(newColorArray);
            this.colorAttribute.count = colorAttributeCount;
        } else {
            this.colorAttribute = new THREE.BufferAttribute(
                newColorArray,
                NUM_COLOR_VALUES_PER_VERTEX,
                true
            );
            this.colorAttribute.count = 0;
            this.colorAttribute.setDynamic(true);
        }

        const newUvArray = new Float32Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_UV_VALUES_PER_VERTEX
        );

        if (this.uvAttribute !== undefined) {
            const uvAttributeCount = this.uvAttribute.count;
            newUvArray.set(this.uvAttribute.array);
            this.uvAttribute.setArray(newUvArray);
            this.uvAttribute.count = uvAttributeCount;
        } else {
            this.uvAttribute = new THREE.BufferAttribute(newUvArray, NUM_UV_VALUES_PER_VERTEX);
            this.uvAttribute.count = 0;
            this.uvAttribute.setDynamic(true);
        }

        const numIndexValues = newSize * NUM_INDICES_PER_ELEMENT * NUM_INDEX_VALUES_PER_VERTEX;

        const newIndexArray =
            numIndexValues > 65535
                ? new Uint32Array(numIndexValues)
                : new Uint16Array(numIndexValues);

        if (this.indexAttribute !== undefined) {
            const indexAttributeCount = this.indexAttribute.count;
            newIndexArray.set(this.indexAttribute.array);
            this.indexAttribute.setArray(newIndexArray);
            this.indexAttribute.count = indexAttributeCount;
        } else {
            this.indexAttribute = new THREE.BufferAttribute(
                newIndexArray,
                NUM_INDEX_VALUES_PER_VERTEX
            );
            this.indexAttribute.count = 0;
            this.indexAttribute.setDynamic(true);
        }

        this.m_size = newSize;
    }
}

/**
 * `TextBuffer` is a specialization of [[BoxBuffer]], which adds glyphs (characters) instead of
 * boxes.
 */
export class TextBuffer extends BoxBuffer {
    /**
     * [[BufferAttribute]] holding the orientation of the glyphs render axis.
     */
    protected glyphAxisAttribute?: THREE.BufferAttribute;

    private m_outlineMesh: BoxBufferMesh | undefined;
    private m_glyphAxis: THREE.Vector2 = new THREE.Vector2();

    /**
     * Buffer to render the glyphs of a font.
     *
     * @param textMaterial Material to be used for [[Mesh]].
     * @param outlineMaterial Material to be used for outline [[Mesh]].
     * @param renderOrder Optional renderOrder of this buffer.
     * @param startGlyphCount Initial number of glyphs this `BoxBuffer` can hold.
     * @param maxGlyphCount Maximum number of glyphs this `BoxBuffer` can hold.
     */
    constructor(
        readonly textMaterial: THREE.Material,
        readonly outlineMaterial: THREE.Material,
        readonly renderOrder: number = 0,
        readonly startGlyphCount = START_TEXT_BUFFER_SIZE,
        readonly maxGlyphCount = MAX_TEXT_BUFFER_SIZE
    ) {
        super(textMaterial, renderOrder, startGlyphCount, maxGlyphCount);
    }

    /**
     * Duplicate this `TextBuffer` with same materials and renderOrder.
     *
     * @returns A clone of this `TextBuffer`.
     */
    clone(): TextBuffer {
        return new TextBuffer(this.textMaterial, this.outlineMaterial, this.renderOrder);
    }

    /**
     * Dispose of the geometry.
     */
    dispose() {
        super.dispose();
        this.m_outlineMesh = undefined;
    }

    /**
     * Get the outline [[Mesh]] object. The geometry instance of the mesh may change if the buffers
     * are resized. The mesh, once created, will not change, so it can always be added to the scene.
     */
    get outlineMesh(): BoxBufferMesh {
        if (this.m_outlineMesh === undefined) {
            this.resize();
        }
        return this.m_outlineMesh!;
    }

    /**
     * Adds a new glyph to this `GlyphBuffer`.
     *
     * @param glyph [[GlyphInfo]] storing the rendering data for the glyph to be added.
     * @param color Glyph's color.
     * @param opacity Glyph's opacity.
     * @param distance Glyph's distance to camera.
     * @param transform Transformation matrix applied to this glyph.
     * @param corners Array of `Vector2` where the corner information will be stored.
     * @param secondaryUVs If `true`, the secondary uvs are copied into the vertex attribute instead
     * of the primary ones.
     * @param verticalAlignment Vertical alignment configuration for this glyph.
     * @param oblique If `true`, added glyph will be slightly slanted.
     * @param backgroundMode Type of background rendering used for this glyph (glow/outline).
     * @param pickInfo Glyph picking information.
     */
    addGlyph(
        glyph: GlyphInfo,
        color: THREE.Color,
        opacity: number,
        distance: number,
        transform: THREE.Matrix4,
        corners: THREE.Vector2[] = [],
        secondaryUVs: boolean,
        verticalAlignment: TextVerticalAlignment,
        oblique: boolean,
        smallCaps: boolean,
        backgroundMode: TextBackgroundMode,
        pickInfo?: any
    ): boolean {
        if (!this.canAddElements()) {
            return false;
        }

        const { s0, t0, s1, t1, s2, t2, s3, t3, page, emulateBold } = glyph;

        const r = Math.round(color.r * 255);
        const g = Math.round(color.g * 255);
        const b = Math.round(color.b * 255);
        const a = Math.round(opacity * 255);

        const positionAttribute = this.positionAttribute!;
        const colorAttribute = this.colorAttribute!;
        const uvAttribute = this.uvAttribute!;
        const indexAttribute = this.indexAttribute!;
        const glyphAxisAttribute = this.glyphAxisAttribute!;

        const baseVertex = positionAttribute.count;
        const baseIndex = indexAttribute.count;

        FontCatalog.getGlyphCorners(
            glyph,
            transform,
            corners,
            secondaryUVs,
            verticalAlignment,
            oblique,
            smallCaps
        );

        // Calculate the horizontal axis of the vector in screen-space to adjust the anti-aliased
        // SDF sampling according to the glyph's rotation.
        this.m_glyphAxis.set(corners[1].x, corners[1].y);
        this.m_glyphAxis.sub(corners[0]).normalize();

        positionAttribute.setXYZ(baseVertex, corners[0].x, corners[0].y, distance);
        positionAttribute.setXYZ(baseVertex + 1, corners[1].x, corners[1].y, distance);
        positionAttribute.setXYZ(baseVertex + 2, corners[2].x, corners[2].y, distance);
        positionAttribute.setXYZ(baseVertex + 3, corners[3].x, corners[3].y, distance);

        glyphAxisAttribute.setXY(baseVertex, this.m_glyphAxis.x, this.m_glyphAxis.y);
        glyphAxisAttribute.setXY(baseVertex + 1, this.m_glyphAxis.x, this.m_glyphAxis.y);
        glyphAxisAttribute.setXY(baseVertex + 2, this.m_glyphAxis.x, this.m_glyphAxis.y);
        glyphAxisAttribute.setXY(baseVertex + 3, this.m_glyphAxis.x, this.m_glyphAxis.y);

        colorAttribute.setXYZW(baseVertex, r, g, b, a);
        colorAttribute.setXYZW(baseVertex + 1, r, g, b, a);
        colorAttribute.setXYZW(baseVertex + 2, r, g, b, a);
        colorAttribute.setXYZW(baseVertex + 3, r, g, b, a);

        const boldWeight = emulateBold ? 0.2 : 0.0;
        const smallCapsWeight = smallCaps ? 0.125 : 0.0;
        if (secondaryUVs) {
            uvAttribute.setXYZW(
                baseVertex,
                s2,
                t3,
                1.0 + boldWeight + smallCapsWeight,
                backgroundMode
            );
            uvAttribute.setXYZW(
                baseVertex + 1,
                s3,
                t3,
                1.0 + boldWeight + smallCapsWeight,
                backgroundMode
            );
            uvAttribute.setXYZW(
                baseVertex + 2,
                s2,
                t2,
                1.0 + boldWeight + smallCapsWeight,
                backgroundMode
            );
            uvAttribute.setXYZW(
                baseVertex + 3,
                s3,
                t2,
                1.0 + boldWeight + smallCapsWeight,
                backgroundMode
            );
        } else {
            uvAttribute.setXYZW(baseVertex, s0, t1, page, backgroundMode);
            uvAttribute.setXYZW(baseVertex + 1, s1, t1, page, backgroundMode);
            uvAttribute.setXYZW(baseVertex + 2, s0, t0, page, backgroundMode);
            uvAttribute.setXYZW(baseVertex + 3, s1, t0, page, backgroundMode);
        }

        indexAttribute.setX(baseIndex, baseVertex);
        indexAttribute.setX(baseIndex + 1, baseVertex + 1);
        indexAttribute.setX(baseIndex + 2, baseVertex + 2);
        indexAttribute.setX(baseIndex + 3, baseVertex + 2);
        indexAttribute.setX(baseIndex + 4, baseVertex + 1);
        indexAttribute.setX(baseIndex + 5, baseVertex + 3);

        positionAttribute.count += NUM_VERTICES_PER_ELEMENT;
        glyphAxisAttribute.count += NUM_VERTICES_PER_ELEMENT;
        colorAttribute.count += NUM_VERTICES_PER_ELEMENT;
        uvAttribute.count += NUM_VERTICES_PER_ELEMENT;
        indexAttribute.count += NUM_INDICES_PER_ELEMENT;

        this.pickInfos.push(pickInfo);

        return true;
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * glyphs are found, the order of the results is unspecified.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickCallback Callback to be called for every picked element.
     */
    pickBoxes(screenPosition: THREE.Vector2, pickCallback: (pickData: any | undefined) => void) {
        const n = this.pickInfos.length;
        const pickInfos = this.pickInfos;
        const positions = this.positionAttribute!;
        const screenX = screenPosition.x;
        const screenY = screenPosition.y;

        for (let pickInfoIndex = 0; pickInfoIndex < n; pickInfoIndex++) {
            const positionIndex = pickInfoIndex * NUM_VERTICES_PER_ELEMENT;

            const minX = Math.min(
                positions.getX(positionIndex + 2),
                positions.getX(positionIndex + 1)
            );

            if (screenX < minX) {
                continue;
            }

            const maxX = Math.max(
                positions.getX(positionIndex + 2),
                positions.getX(positionIndex + 1)
            );
            if (screenX > maxX) {
                continue;
            }

            const minY = Math.min(
                positions.getY(positionIndex + 2),
                positions.getY(positionIndex + 1)
            );
            if (screenY < minY) {
                continue;
            }

            const maxY = Math.max(
                positions.getY(positionIndex + 2),
                positions.getY(positionIndex + 1)
            );
            if (screenY > maxY) {
                continue;
            }

            if (pickInfos[pickInfoIndex] !== undefined) {
                pickCallback(pickInfos[pickInfoIndex]);
            }
        }
    }

    /**
     * Creates a new [[Geometry]] object from all the attribute data stored in this `TextBuffer`.
     * The main and outline [[Mesh]] objects may be created if not initialized already.
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

        this.geometry.addAttribute("position", this.positionAttribute!);
        this.geometry.addAttribute("glyphAxis", this.glyphAxisAttribute!);
        this.geometry.addAttribute("color", this.colorAttribute!);
        this.geometry.addAttribute("uv", this.uvAttribute!);
        this.geometry.setIndex(this.indexAttribute!);
        this.geometry.addGroup(0, this.indexAttribute!.count);

        if (this.internalMesh === undefined) {
            this.internalMesh = new BoxBufferMesh(this.geometry, this.material);
        } else {
            this.internalMesh.geometry = this.geometry;
        }

        if (this.m_outlineMesh === undefined) {
            this.m_outlineMesh = new BoxBufferMesh(this.geometry, this.outlineMaterial);
        } else {
            this.m_outlineMesh.geometry = this.geometry;
        }

        return this.internalMesh;
    }

    /**
     * Updates a [[BufferGeometry]] object to reflect the changes in this `TextBuffer`'s attribute
     * data.
     */
    updateBufferGeometry() {
        const glyphAxisAttribute = this.glyphAxisAttribute!;
        if (glyphAxisAttribute.count > 0) {
            glyphAxisAttribute.needsUpdate = true;
            glyphAxisAttribute.updateRange.offset = 0;
            glyphAxisAttribute.updateRange.count =
                glyphAxisAttribute.count * NUM_VERTICES_PER_ELEMENT;
        }

        super.updateBufferGeometry();
    }

    /**
     * Remove current attributes and arrays. Minimizes memory footprint.
     */
    protected clearAttributes() {
        this.glyphAxisAttribute = undefined;
        super.clearAttributes();
    }

    /**
     * Resize the attribute buffers. New value must be larger than the previous one.
     *
     * @param newSize New number of elements in the buffer. Number has to be larger than the
     *      previous size.
     */
    protected resizeBuffer(newSize: number) {
        const newGlyphAxisArray = new Float32Array(
            newSize * NUM_VERTICES_PER_ELEMENT * NUM_GLYPH_AXIS_VALUES_PER_VERTEX
        );

        if (this.glyphAxisAttribute !== undefined) {
            const glyphAxisAttributeCount = this.glyphAxisAttribute.count;
            newGlyphAxisArray.set(this.glyphAxisAttribute.array);
            this.glyphAxisAttribute.setArray(newGlyphAxisArray);
            this.glyphAxisAttribute.count = glyphAxisAttributeCount;
        } else {
            this.glyphAxisAttribute = new THREE.BufferAttribute(
                newGlyphAxisArray,
                NUM_GLYPH_AXIS_VALUES_PER_VERTEX
            );
            this.glyphAxisAttribute.count = 0;
            this.glyphAxisAttribute.setDynamic(true);
        }

        super.resizeBuffer(newSize);
    }
}
