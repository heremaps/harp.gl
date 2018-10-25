/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Collection of metrics related to how a TrueType font should be rendered.
 */
export interface FontMetrics {
    /**
     * Size of the internal font's coordinate grid.
     */
    unitsPerEm?: number;

    /**
     * Font's ascender (part of a lower-case letter that goes above the font's xHeight).
     */
    ascent?: number;

    /**
     * Font's descender (part of a lower-case letter that falls below the font's baseline).
     */
    descent?: number;

    /**
     * Amount of extra space added between two vertical lines.
     */
    lineGap?: number;

    /**
     * The offset from the font's baseline where the underline should be positioned.
     */
    underlinePosition?: number;

    /**
     * Thickness of the underline.
     */
    underlineThickness?: number;

    /**
     * Angles by which characters are slanted when italic.
     */
    italicAngle?: number;

    /**
     * The height of capital letters above the baseline.
     */
    capHeight?: number;

    /**
     * The height of lower case letters above the baseline.
     */
    xHeight?: number;

    /**
     * Minimum X value for all glyphs in the font.
     */
    minX?: number;

    /**
     * Minimum Y value for all glyphs in the font.
     */
    minY?: number;

    /**
     * Maximum X value for all glyphs in the font.
     */
    maxX?: number;

    /**
     * Maximum Y value for all glyphs in the font.
     */
    maxY?: number;
}

/**
 * Glyph rendering direction.
 */
export enum GlyphDirection {
    Neutral = 0.0,
    Weak = 0.5,
    LTR = 1.0,
    RTL = -1.0
}

/**
 * Declares an interface for a `struct` containing all the necessary information needed to render a
 * glyph using a font texture atlas.
 */
export interface GlyphInfo {
    /**
     * Unicode codepoint.
     */
    codepoint: number;

    /**
     * Glyph's direction.
     */
    direction: GlyphDirection;

    /**
     * Amount of pixels we should advance on the horizontal axis after drawing the glyph.
     */
    advanceX: number;

    /**
     * Amount of pixels the current position should be offset on the horizontal axis when copying
     * this glyph.
     */
    offsetX: number;

    /**
     * Amount of pixels the current position should be offset on the vertical axis when copying this
     * glyph.
     */
    offsetY: number;

    /**
     * Glyph's width in pixels.
     */
    width: number;

    /**
     * Glyph's height in pixels.
     */
    height: number;

    /**
     * Glyph's left texture coordinate.
     */
    s0: number;

    /**
     * Glyph's bottom texture coordinate.
     */
    t0: number;

    /**
     * Glyph's right texture coordinate.
     */
    s1: number;

    /**
     * Glyph's top texture coordinate.
     */
    t1: number;

    /**
     * Glyph's secondary left texture coordinate (useful when copying glyphs into dynamic atlas).
     */
    s2: number;

    /**
     * Glyph's secondary bottom texture coordinate (useful when copying glyphs into dynamic atlas).
     */
    t2: number;

    /**
     * Glyph's secondary right texture coordinate (useful when copying glyphs into dynamic atlas).
     */
    s3: number;

    /**
     * Glyph's secondary top texture coordinate (useful when copying glyphs into dynamic atlas).
     */
    t3: number;

    /**
     * Glyph's page index.
     */
    page: number;

    /**
     * Glyph's original resource.
     */
    texture: THREE.Texture;

    /**
     * Glyph's bold emulation.
     */
    emulateBold: boolean;

    /**
     * Glyph's font size.
     */
    size: number;

    /**
     * Distance in pixels between each line of text using this glyph's font.
     */
    lineHeight: number;

    /**
     * Distance in pixels between `lineHeight` and the baseline.
     */
    base: number;

    /**
     * Glyph's font rendering metrics.
     */
    metrics: FontMetrics;
}
