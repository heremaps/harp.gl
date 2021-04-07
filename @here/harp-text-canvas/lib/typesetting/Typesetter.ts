/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { FontCatalog } from "../rendering/FontCatalog";
import { GlyphData } from "../rendering/GlyphData";
import { TextGeometry } from "../rendering/TextGeometry";
import { TextLayoutStyle, TextRenderStyle } from "../rendering/TextStyle";

/**
 * Parameters passed when placing glyphs using [[Typesetter]]'s `arrangeGlyphs` function.
 */
export interface TypesettingParameters {
    /**
     * Array of all [[GlyphData]] to be placed.
     */
    glyphs: GlyphData[];

    /**
     * [[FontCatalog]] used to retrieve all glyphs in `glyphDataArray`.
     */
    fontCatalog: FontCatalog;

    /**
     * [[TextRenderStyle]] to be applied when arranging glyphs.
     */
    textRenderStyle: TextRenderStyle;

    /**
     * [[TextLayoutStyle]] to be applied when arranging glyphs.
     */
    textLayoutStyle: TextLayoutStyle;

    /**
     * Screen-space position where to start arranging glyphs.
     */
    position: THREE.Vector3;

    /**
     * Target [[TextGeometry]] where arranged glyphs will be stored.
     */
    geometry: TextGeometry;

    /**
     * Array of booleans containing information regarding if a glyph is emulating the `smallCaps`
     * feature (which modifies its scale during typesetting).
     */
    smallCapsArray?: boolean[];

    /**
     * Global bounding box for all glyphs added in this call of `arrangeGlyphs`.
     */
    globalBounds?: THREE.Box2;

    /**
     * Individual bounding boxes for each glyph added in this call of `arrangeGlyphs`.
     */
    individualBounds?: { array: THREE.Box2[]; offset: number };

    /**
     * Target `Float32Array` where arranged glyphs will be stored. Overrides `geometry` parameter.
     */
    vertexBuffer?: Float32Array;
}

/**
 * Interface that handles glyph placement and layout. Mainly used by [[TextCanvas]].
 */
export interface Typesetter {
    /**
     * Arranges the specified glyphs using this `Typesetter`.
     *
     * @param params - Typesetting parameters.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    arrangeGlyphs(params: TypesettingParameters): boolean;
}
