/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { UnicodeUtils } from "../utils/UnicodeUtils";
import { Font } from "./FontCatalog";

/**
 * Structure containing all the required information necessary to render a BMFont glyph using
 * [[TextCanvas]].
 */
export class GlyphData {
    /**
     * Unicode character represented by this glyph.
     */
    readonly character: string;

    /**
     * Glyph' direction.
     */
    readonly direction: UnicodeUtils.Direction;

    /**
     * Array containing the positions for all corners of this glyph.
     */
    positions: THREE.Vector3[] = [];

    /**
     * Array containing the source texture coordinates for all corners of this glyph.
     * Used to sample the original texture atlas pages.
     */
    sourceTextureCoordinates: THREE.Vector2[] = [];

    /**
     * Array containing the dynamic texture coordinates for all corners of this glyph.
     * Used to sample the dynamic texture atlas page.
     */
    dynamicTextureCoordinates: THREE.Vector2[] = [];

    /**
     * Source texture atlas' page copy index.
     */
    copyIndex: number = 0;

    /**
     * Flag indicating if glyph can be currently rendered.
     */
    isInCache: boolean = false;

    /**
     * Creates a new `GlyphData` object.
     *
     * @param codePoint - Unicode code point.
     * @param block - Unicode block.
     * @param width - Glyph' width.
     * @param height - Glyph' height.
     * @param advanceX - Amount of pixel to move after placing this glyph.
     * @param offsetX - Horizontal offset from the glyph' origin.
     * @param offsetY - Vertical offset from the glyph' origin.
     * @param u0 - Glyph' left texture coordinate.
     * @param v0 - Glyph' bottom texture coordinate.
     * @param u1 - Glyph' right texture coordinate.
     * @param v1 - Glyph' top texture coordinate.
     * @param texture - Glyph' source texture atlas page.
     * @param font - Glyph' font.
     * @param isReplacement - `true` if glyph is a replacement for a missing glyph.
     *
     * @returns New `GlyphData`.
     */
    constructor(
        readonly codePoint: number,
        readonly block: string,
        readonly width: number,
        readonly height: number,
        readonly advanceX: number,
        readonly offsetX: number,
        readonly offsetY: number,
        u0: number,
        v0: number,
        u1: number,
        v1: number,
        readonly texture: THREE.Texture,
        readonly font: Font,
        readonly isReplacement: boolean = false
    ) {
        this.character = String.fromCodePoint(codePoint);
        this.direction = UnicodeUtils.getDirection(codePoint, block);

        const left = this.offsetX;
        const right = left + this.width;
        const top = font.metrics.lineHeight - this.offsetY;
        const bottom = top - this.height;

        this.positions.push(
            new THREE.Vector3(left, bottom, 1.0),
            new THREE.Vector3(right, bottom, 1.0),
            new THREE.Vector3(left, top, 1.0),
            new THREE.Vector3(right, top, 1.0)
        );

        this.sourceTextureCoordinates.push(
            new THREE.Vector2(u0, v0),
            new THREE.Vector2(u1, v0),
            new THREE.Vector2(u0, v1),
            new THREE.Vector2(u1, v1)
        );

        this.dynamicTextureCoordinates.push(
            new THREE.Vector2(0.0, 0.0),
            new THREE.Vector2(1.0, 0.0),
            new THREE.Vector2(0.0, 1.0),
            new THREE.Vector2(1.0, 1.0)
        );
    }

    /**
     * Clone this `GlyphData`.
     *
     * @returns Cloned `GlyphData`.
     */
    clone(): GlyphData {
        return new GlyphData(
            this.codePoint,
            this.block,
            this.width,
            this.height,
            this.advanceX,
            this.offsetX,
            this.offsetY,
            this.sourceTextureCoordinates[0].x,
            this.sourceTextureCoordinates[0].y,
            this.sourceTextureCoordinates[3].x,
            this.sourceTextureCoordinates[3].y,
            this.texture,
            this.font,
            this.isReplacement
        );
    }
}
