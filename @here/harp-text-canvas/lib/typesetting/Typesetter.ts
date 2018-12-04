/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FontCatalog } from "../rendering/FontCatalog";
import { GlyphData } from "../rendering/GlyphData";
import { TextGeometry } from "../rendering/TextGeometry";
import { LayoutStyle, TextStyle } from "../rendering/TextStyle";

/**
 * Parameters passed when placing glyphs using [[Typesetter]]'s `arrangeGlyphs` function.
 */
export interface TypesettingParameters {
    /**
     * Array of all [[GlyphData]] to be placed.
     */
    glyphDataArray: GlyphData[];

    /**
     * Array of all results of [[FontVariant]] transformations for all glyphs in `glyphDataArray`.
     */
    glyphTransformationArray: boolean[];

    /**
     * [[FontCatalog]] used to retrieve all glyphs in `glyphDataArray`.
     */
    fontCatalog: FontCatalog;

    /**
     * [[TextStyle]] to be applied when arranging glyphs.
     */
    textStyle: TextStyle;

    /**
     * [[LayoutStyle]] to be applied when arranging glyphs.
     */
    layoutStyle: LayoutStyle;

    /**
     * Screen-space position where to start arranging glyphs.
     */
    position: THREE.Vector3;

    /**
     * Target [[TextGeometry]] where arranged glyphs will be stored.
     */
    geometry: TextGeometry;

    /**
     * Global bounding box for all glyphs added in this call of `arrangeGlyphs`.
     */
    globalBounds?: THREE.Box2;

    /**
     * Individual bounding boxes for each glyph added in this call of `arrangeGlyphs`.
     */
    individualBounds?: { array: THREE.Box2[]; offset: number };
}

/**
 * Interface that handles glyph placement and layout. Mainly used by [[TextCanvas]].
 */
export interface Typesetter {
    /**
     * Arranges the specified glyphs using this `Typesetter`.
     *
     * @param params Typesetting parameters.
     *
     * @returns If `false`, some error occurred during execution and the output should be dismissed.
     */
    arrangeGlyphs(params: TypesettingParameters): boolean;
}
