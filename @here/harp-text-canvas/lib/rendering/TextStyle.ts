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
 * Text wrapping rule used when `lineWidth` is reached.
 */
export enum WrappingMode {
    None,
    Character,
    Word
}

/**
 * Namespace containing default values for all members of [[TextRenderParameters]] and
 * [[TextLayoutParameters]].
 */
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
    export const DEFAULT_COLOR: THREE.Color = new THREE.Color(0x000000);
    export const DEFAULT_OPACITY: number = 1.0;
    export const DEFAULT_BACKGROUND_COLOR: THREE.Color = new THREE.Color(0x000000);
    export const DEFAULT_BACKGROUND_OPACITY: number = 0.0;

    export const DEFAULT_TRACKING: number = 0.0;
    export const DEFAULT_LEADING: number = 0.0;
    export const DEFAULT_MAX_LINES: number = Infinity;
    export const DEFAULT_LINE_WIDTH: number = Infinity;
    export const DEFAULT_LINE_ROTATION: number = 0.0;
    export const DEFAULT_WRAPPING_MODE: WrappingMode = WrappingMode.Word;
    export const DEFAULT_VERTICAL_ALIGNMENT: VerticalAlignment = VerticalAlignment.Above;
    export const DEFAULT_HORIZONTAL_ALIGNMENT: HorizontalAlignment = HorizontalAlignment.Left;
}

/**
 * [[TextCanvas]] text rendering parameters.
 */
export interface TextRenderParameters {
    fontName?: string;
    fontSize?: FontSize;
    fontStyle?: FontStyle;
    fontVariant?: FontVariant;
    rotation?: number;
    color?: THREE.Color;
    backgroundColor?: THREE.Color;
    opacity?: number;
    backgroundOpacity?: number;
}

/**
 * [[TextCanvas]] text rendering style.
 */
export class TextRenderStyle {
    private m_params: TextRenderParameters;

    /**
     * Creates a new `TextRenderStyle`.
     *
     * @param params Input [[TextRenderParameters]].
     *
     * @returns New `TextRenderStyle`.
     */
    constructor(params: TextRenderParameters = {}) {
        this.m_params = {
            fontName:
                params.fontName !== undefined
                    ? params.fontName
                    : DefaultTextStyle.DEFAULT_FONT_NAME,
            fontSize:
                params.fontSize !== undefined
                    ? params.fontSize
                    : {
                          unit: DefaultTextStyle.DEFAULT_FONT_SIZE.unit,
                          size: DefaultTextStyle.DEFAULT_FONT_SIZE.size,
                          backgroundSize: DefaultTextStyle.DEFAULT_FONT_SIZE.backgroundSize
                      },
            fontStyle:
                params.fontStyle !== undefined
                    ? params.fontStyle
                    : DefaultTextStyle.DEFAULT_FONT_STYLE,
            fontVariant:
                params.fontVariant !== undefined
                    ? params.fontVariant
                    : DefaultTextStyle.DEFAULT_FONT_VARIANT,
            rotation:
                params.rotation !== undefined ? params.rotation : DefaultTextStyle.DEFAULT_ROTATION,
            color:
                params.color !== undefined
                    ? params.color
                    : new THREE.Color(DefaultTextStyle.DEFAULT_COLOR),
            opacity:
                params.opacity !== undefined ? params.opacity : DefaultTextStyle.DEFAULT_OPACITY,
            backgroundColor:
                params.backgroundColor !== undefined
                    ? params.backgroundColor
                    : new THREE.Color(DefaultTextStyle.DEFAULT_BACKGROUND_COLOR),
            backgroundOpacity:
                params.backgroundOpacity !== undefined
                    ? params.backgroundOpacity
                    : DefaultTextStyle.DEFAULT_BACKGROUND_OPACITY
        };
    }

    /**
     * Current [[TextRenderParameters]] for this style.
     */
    get params(): TextRenderParameters {
        return this.m_params;
    }
    set params(value: TextRenderParameters) {
        this.m_params = { ...this.m_params, ...value };
    }

    /**
     * Name of the preferred [[Font]] to be used when rendering.
     */
    get fontName(): string {
        return this.m_params.fontName!;
    }
    set fontName(value: string) {
        this.m_params.fontName = value;
    }

    /**
     * Collection of unit and sizes to apply for the currently active [[Font]].
     */
    get fontSize(): FontSize {
        return this.m_params.fontSize!;
    }
    set fontSize(value: FontSize) {
        this.m_params.fontSize = value;
    }

    /**
     * Glyph style to apply for the currently active [[Font]].
     */
    get fontStyle(): FontStyle {
        return this.m_params.fontStyle!;
    }
    set fontStyle(value: FontStyle) {
        this.m_params.fontStyle = value;
    }

    /**
     * Glyph variant to apply for the currently active [[Font]].
     */
    get fontVariant(): FontVariant {
        return this.m_params.fontVariant!;
    }
    set fontVariant(value: FontVariant) {
        this.m_params.fontVariant = value;
    }

    /**
     * Glyph local rotation (radians).
     */
    get rotation(): number {
        return this.m_params.rotation!;
    }
    set rotation(value: number) {
        this.m_params.rotation = value;
    }

    /**
     * Glyph color.
     */
    get color(): THREE.Color {
        return this.m_params.color!;
    }
    set color(value: THREE.Color) {
        this.m_params.color = value;
    }

    /**
     * Glyph background color.
     */
    get backgroundColor(): THREE.Color {
        return this.m_params.backgroundColor!;
    }
    set backgroundColor(value: THREE.Color) {
        this.m_params.backgroundColor = value;
    }

    /**
     * Glyph opacity.
     */
    get opacity(): number {
        return this.m_params.opacity!;
    }
    set opacity(value: number) {
        this.m_params.opacity = value;
    }

    /**
     * Glyph background opacity.
     */
    get backgroundOpacity(): number {
        return this.m_params.backgroundOpacity!;
    }
    set backgroundOpacity(value: number) {
        this.m_params.backgroundOpacity = value;
    }

    /**
     * Clone this `TextRenderStyle`.
     *
     * @param params Input [[TextRenderParameters]].
     *
     * @returns Cloned `TextRenderStyle`.
     */
    clone(params: TextRenderParameters = {}): TextRenderStyle {
        return new TextRenderStyle({ ...this.m_params, ...params });
    }
}

/**
 * [[TextCanvas]] text layout parameters.
 */
export interface TextLayoutParameters {
    tracking?: number;
    leading?: number;
    maxLines?: number;
    lineWidth?: number;
    lineRotation?: number;
    wrappingMode?: WrappingMode;
    verticalAlignment?: VerticalAlignment;
    horizontalAlignment?: HorizontalAlignment;
}

/**
 * [[TextCanvas]] text rendering style.
 */
export class TextLayoutStyle {
    private m_params: TextLayoutParameters;

    /**
     * Creates a new `TextLayoutStyle`.
     *
     * @param params Input [[TextLayoutParameters]].
     *
     * @returns New `TextLayoutStyle`.
     */
    constructor(params: TextLayoutParameters = {}) {
        this.m_params = {
            tracking:
                params.tracking !== undefined ? params.tracking : DefaultTextStyle.DEFAULT_TRACKING,
            leading:
                params.leading !== undefined ? params.leading : DefaultTextStyle.DEFAULT_LEADING,
            maxLines:
                params.maxLines !== undefined
                    ? params.maxLines
                    : DefaultTextStyle.DEFAULT_MAX_LINES,
            lineWidth:
                params.lineWidth !== undefined
                    ? params.lineWidth
                    : DefaultTextStyle.DEFAULT_LINE_WIDTH,
            lineRotation:
                params.lineRotation !== undefined
                    ? params.lineRotation
                    : DefaultTextStyle.DEFAULT_LINE_ROTATION,
            wrappingMode:
                params.wrappingMode !== undefined
                    ? params.wrappingMode
                    : DefaultTextStyle.DEFAULT_WRAPPING_MODE,
            verticalAlignment:
                params.verticalAlignment !== undefined
                    ? params.verticalAlignment
                    : DefaultTextStyle.DEFAULT_VERTICAL_ALIGNMENT,
            horizontalAlignment:
                params.horizontalAlignment !== undefined
                    ? params.horizontalAlignment
                    : DefaultTextStyle.DEFAULT_HORIZONTAL_ALIGNMENT
        };
    }

    /**
     * Current [[TextLayoutParameters]] for this style.
     */
    get params(): TextLayoutParameters {
        return this.m_params;
    }
    set params(value: TextLayoutParameters) {
        this.m_params = { ...this.m_params, ...value };
    }

    /**
     * Inter-glyph spacing (pixels). Scaled by [[FontSize]].
     */
    get tracking(): number {
        return this.m_params.tracking!;
    }
    set tracking(value: number) {
        this.m_params.tracking = value;
    }

    /**
     * Inter-line spacing (pixels). Scaled by [[FontSize]].
     */
    get leading(): number {
        return this.m_params.leading!;
    }
    set leading(value: number) {
        this.m_params.leading = value;
    }

    /**
     * Maximum number of lines to be considered when using [[TextCanvas]].
     */
    get maxLines(): number {
        return this.m_params.maxLines!;
    }
    set maxLines(value: number) {
        this.m_params.maxLines = value;
    }

    /**
     * Maximum line width (pixels).
     */
    get lineWidth(): number {
        return this.m_params.lineWidth!;
    }
    set lineWidth(value: number) {
        this.m_params.lineWidth = value;
    }

    /**
     * Line typesetting rotation (radians).
     */
    get lineRotation(): number {
        return this.m_params.lineRotation!;
    }
    set lineRotation(value: number) {
        this.m_params.lineRotation = value;
    }

    /**
     * Wrapping (line-breaking) mode.
     */
    get wrappingMode(): WrappingMode {
        return this.m_params.wrappingMode!;
    }
    set wrappingMode(value: WrappingMode) {
        this.m_params.wrappingMode = value;
    }

    /**
     * Text position regarding the baseline.
     */
    get verticalAlignment(): VerticalAlignment {
        return this.m_params.verticalAlignment!;
    }
    set verticalAlignment(value: VerticalAlignment) {
        this.m_params.verticalAlignment = value;
    }

    /**
     * Text position inside a line.
     */
    get horizontalAlignment(): HorizontalAlignment {
        return this.m_params.horizontalAlignment!;
    }
    set horizontalAlignment(value: HorizontalAlignment) {
        this.m_params.horizontalAlignment = value;
    }

    /**
     * Clone this `TextLayoutStyle`.
     *
     * @param params Input [[TextLayoutParameters]].
     *
     * @returns Cloned `TextLayoutStyle`.
     */
    clone(params: TextLayoutParameters = {}): TextLayoutStyle {
        return new TextLayoutStyle({ ...this.m_params, ...params });
    }
}
