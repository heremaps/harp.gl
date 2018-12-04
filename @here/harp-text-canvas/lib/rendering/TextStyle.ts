/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Unit of measurement used to specify a font's size.
 */
export enum FontUnit {
    Em,
    Pixel,
    Point,
    Percent
}

/**
 * Pair of unit and size specifying a font's size.
 */
export interface FontSize {
    unit: FontUnit;
    size: number;
    backgroundSize: number;
}

/**
 * Style to be used when rendering glyphs.
 */
export enum FontStyle {
    Regular,
    Bold,
    Italic,
    BoldItalic
}

/**
 * Variant to be used when rendering.
 */
export enum FontVariant {
    Regular,
    AllCaps,
    SmallCaps
}

/**
 * Text style applied when adding glyphs to a [[TextCanvas]].
 */
export interface TextStyle {
    font?: string;
    fontSize?: FontSize;
    fontStyle?: FontStyle;
    fontVariant?: FontVariant;
    rotation?: number;
    glyphRotation?: number;
    tracking?: number;
    color?: THREE.Color;
    backgroundColor?: THREE.Color;
    opacity?: number;
    backgroundOpacity?: number;
}

export namespace DefaultTextStyle {
    export const DEFAULT_FONT_NAME: string = "";
    export const DEFAULT_FONT_SIZE: FontSize = {
        unit: Object.freeze(FontUnit.Pixel),
        size: Object.freeze(16.0),
        backgroundSize: Object.freeze(0.0)
    };
    export const DEFAULT_FONT_STYLE: FontStyle = FontStyle.Regular;
    export const DEFAULT_FONT_VARIANT: FontVariant = FontVariant.Regular;
    export const DEFAULT_ROTATION: number = 0.0;
    export const DEFAULT_GLYPH_ROTATION: number = 0.0;
    export const DEFAULT_TRACKING: number = 0.0;
    export const DEFAULT_COLOR: THREE.Color = new THREE.Color(0x000000);
    export const DEFAULT_OPACITY: number = 1.0;
    export const DEFAULT_BACKGROUND_COLOR: THREE.Color = new THREE.Color(0x000000);
    export const DEFAULT_BACKGROUND_OPACITY: number = 0.0;

    /**
     * Override all uninitialized [[TextStyle]] values to their default values.
     */
    export function initializeTextStyle(style: TextStyle = {}): TextStyle {
        style.font = style.font !== undefined ? style.font : DEFAULT_FONT_NAME;
        style.fontSize =
            style.fontSize !== undefined
                ? style.fontSize
                : {
                      unit: DEFAULT_FONT_SIZE.unit,
                      size: DEFAULT_FONT_SIZE.size,
                      backgroundSize: DEFAULT_FONT_SIZE.backgroundSize
                  };
        style.fontStyle = style.fontStyle !== undefined ? style.fontStyle : DEFAULT_FONT_STYLE;
        style.fontVariant =
            style.fontVariant !== undefined ? style.fontVariant : DEFAULT_FONT_VARIANT;
        style.rotation = style.rotation !== undefined ? style.rotation : DEFAULT_ROTATION;
        style.glyphRotation =
            style.glyphRotation !== undefined ? style.glyphRotation : DEFAULT_GLYPH_ROTATION;
        style.tracking = style.tracking !== undefined ? style.tracking : DEFAULT_TRACKING;
        style.color = style.color !== undefined ? style.color : new THREE.Color(DEFAULT_COLOR);
        style.opacity = style.opacity !== undefined ? style.opacity : DEFAULT_OPACITY;
        style.backgroundColor =
            style.backgroundColor !== undefined
                ? style.backgroundColor
                : new THREE.Color(DEFAULT_BACKGROUND_COLOR);
        style.backgroundOpacity =
            style.backgroundOpacity !== undefined
                ? style.backgroundOpacity
                : DEFAULT_BACKGROUND_OPACITY;
        return style;
    }
}

/**
 * Vertical alignment to be used when placing text.
 */
export enum VerticalAlignment {
    Above = 0.0,
    Center = -0.5,
    Below = -1.0
}

/**
 * Horizontal alignment to be used when placing text.
 */
export enum HorizontalAlignment {
    Left = 0.0,
    Center = -0.5,
    Right = -1.0
}

/**
 * Text wrapping rule used when [[LayoutStyle]]'s `lineWidth` is reached.
 */
export enum WrappingMode {
    None,
    Character,
    Word
}

/**
 * Layout style applied when adding glyphs to a [[TextCanvas]].
 */
export interface LayoutStyle {
    lineWidth?: number;
    maxLines?: number;
    leading?: number;
    verticalAlignment?: VerticalAlignment;
    horizontalAlignment?: HorizontalAlignment;
    wrappingMode?: WrappingMode;
}

export namespace DefaultLayoutStyle {
    export const DEFAULT_LINE_WIDTH = Infinity;
    export const DEFAULT_MAX_LINES = Infinity;
    export const DEFAULT_LEADING = 0.0;
    export const DEFAULT_VERTICAL_ALIGNMENT = VerticalAlignment.Above;
    export const DEFAULT_HORIZONTAL_ALIGNMENT = HorizontalAlignment.Left;
    export const DEFAULT_WRAPPING_MODE = WrappingMode.Word;

    /**
     * Override all uninitialized [[LayoutStyle]] values to their default values.
     */
    export function initializeLayoutStyle(style: LayoutStyle = {}): LayoutStyle {
        style.lineWidth = style.lineWidth !== undefined ? style.lineWidth : DEFAULT_LINE_WIDTH;
        style.maxLines = style.maxLines !== undefined ? style.maxLines : DEFAULT_MAX_LINES;
        style.leading = style.leading !== undefined ? style.leading : DEFAULT_LEADING;
        style.verticalAlignment =
            style.verticalAlignment !== undefined
                ? style.verticalAlignment
                : DEFAULT_VERTICAL_ALIGNMENT;
        style.horizontalAlignment =
            style.horizontalAlignment !== undefined
                ? style.horizontalAlignment
                : DEFAULT_HORIZONTAL_ALIGNMENT;
        style.wrappingMode =
            style.wrappingMode !== undefined ? style.wrappingMode : DEFAULT_WRAPPING_MODE;
        return style;
    }
}
