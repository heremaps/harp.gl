/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ColorUtils,
    getPropertyValue,
    LineMarkerTechnique,
    MapEnv,
    PoiTechnique,
    TextStyleDefinition,
    TextTechnique,
    Theme
} from "@here/harp-datasource-protocol";
import {
    DefaultTextStyle,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    TextCanvas,
    TextLayoutParameters,
    TextLayoutStyle,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";
import { getOptionValue, LoggerManager } from "@here/harp-utils";
import { ColorCache } from "../ColorCache";
import { evaluateColorProperty } from "../DecodedTileHelpers";
import { PoiRenderer } from "../poi/PoiRenderer";
import { Tile } from "../Tile";
import { TextCanvasRenderer } from "./TextCanvasRenderer";

const logger = LoggerManager.instance.create("TextStyleCache");

const defaultTextRenderStyle = new TextRenderStyle({
    fontSize: {
        unit: FontUnit.Pixel,
        size: 32,
        backgroundSize: 8
    },
    color: ColorCache.instance.getColor("#6d7477"),
    opacity: 1.0,
    backgroundColor: ColorCache.instance.getColor("#f7fbfd"),
    backgroundOpacity: 0.5
});

const defaultTextLayoutStyle = new TextLayoutStyle({
    verticalAlignment: VerticalAlignment.Center,
    horizontalAlignment: HorizontalAlignment.Center
});

const DEFAULT_STYLE_NAME = "default";

/**
 * [[TextElementsRenderer]] representation of a [[Theme]]'s TextStyle.
 */
export interface TextElementStyle {
    name: string;
    fontCatalog: string;
    renderParams: TextRenderParameters;
    layoutParams: TextLayoutParameters;
    textCanvas?: TextCanvas;
    poiRenderer?: PoiRenderer;
}

export class TextStyleCache {
    private m_textStyles: Map<string, TextElementStyle> = new Map();
    private m_defaultStyle: TextElementStyle = {
        name: DEFAULT_STYLE_NAME,
        fontCatalog: "",
        renderParams: defaultTextRenderStyle.params,
        layoutParams: defaultTextLayoutStyle.params
    };

    constructor(private m_theme: Theme) {}

    initializeDefaultTextElementStyle(defaultFontCatalogName: string) {
        if (this.m_theme.textStyles === undefined) {
            this.m_theme.textStyles = [];
        }
        const styles = this.m_theme.textStyles;

        const themedDefaultStyle = styles.find(style => style.name === DEFAULT_STYLE_NAME);
        if (themedDefaultStyle !== undefined) {
            this.m_defaultStyle = this.createTextElementStyle(
                themedDefaultStyle,
                DEFAULT_STYLE_NAME
            );
        } else if (this.m_theme.defaultTextStyle !== undefined) {
            this.m_defaultStyle = this.createTextElementStyle(
                this.m_theme.defaultTextStyle,
                DEFAULT_STYLE_NAME
            );
        } else if (styles.length > 0) {
            this.m_defaultStyle = this.createTextElementStyle(styles[0], DEFAULT_STYLE_NAME);
        }
        this.m_defaultStyle.fontCatalog = defaultFontCatalogName;
    }

    initializeTextElementStyles(
        defaultPoiRenderer: PoiRenderer,
        defaultTextCanvas: TextCanvas,
        textRenderers: TextCanvasRenderer[]
    ) {
        // Initialize default text style.
        if (this.m_defaultStyle.fontCatalog !== undefined) {
            const styledTextRenderer = textRenderers.find(
                textRenderer => textRenderer.fontCatalog === this.m_defaultStyle.fontCatalog
            );
            this.m_defaultStyle.textCanvas =
                styledTextRenderer !== undefined ? styledTextRenderer.textCanvas : undefined;
            this.m_defaultStyle.poiRenderer =
                styledTextRenderer !== undefined ? styledTextRenderer.poiRenderer : undefined;
        }
        if (this.m_defaultStyle.textCanvas === undefined) {
            if (this.m_defaultStyle.fontCatalog !== undefined) {
                logger.warn(
                    `FontCatalog '${this.m_defaultStyle.fontCatalog}' set in TextStyle '${
                        this.m_defaultStyle.name
                    }' not found, using default fontCatalog(${
                        defaultTextCanvas!.fontCatalog.name
                    }).`
                );
            }
            this.m_defaultStyle.textCanvas = defaultTextCanvas;
            this.m_defaultStyle.poiRenderer = defaultPoiRenderer;
        }

        // Initialize theme text styles.
        this.m_theme.textStyles!.forEach(element => {
            this.m_textStyles.set(
                element.name!,
                this.createTextElementStyle(element, element.name!)
            );
        });
        // tslint:disable-next-line:no-unused-variable
        for (const [, style] of this.m_textStyles) {
            if (style.textCanvas === undefined) {
                if (style.fontCatalog !== undefined) {
                    const styledTextRenderer = textRenderers.find(
                        textRenderer => textRenderer.fontCatalog === style.fontCatalog
                    );
                    style.textCanvas =
                        styledTextRenderer !== undefined
                            ? styledTextRenderer.textCanvas
                            : undefined;
                    style.poiRenderer =
                        styledTextRenderer !== undefined
                            ? styledTextRenderer.poiRenderer
                            : undefined;
                }
                if (style.textCanvas === undefined) {
                    if (style.fontCatalog !== undefined) {
                        logger.warn(
                            `FontCatalog '${style.fontCatalog}' set in TextStyle '${
                                style.name
                            }' not found, using default fontCatalog(${
                                defaultTextCanvas!.fontCatalog.name
                            }).`
                        );
                    }
                    style.textCanvas = defaultTextCanvas;
                    style.poiRenderer = defaultPoiRenderer;
                }
            }
        }
    }

    /**
     * Retrieves a [[TextElementStyle]] for [[Theme]]'s [[TextStyle]] id.
     */
    getTextElementStyle(styleId?: string): TextElementStyle {
        let result;
        if (styleId === undefined) {
            result = this.m_defaultStyle;
        } else {
            result = this.m_textStyles.get(styleId);
            if (result === undefined) {
                result = this.m_defaultStyle;
            }
        }
        return result;
    }

    /**
     * Gets the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     */
    createRenderStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextRenderStyle {
        const mapView = tile.mapView;
        const zoomLevel = mapView.zoomLevel;
        const discreteZoomLevel = Math.floor(zoomLevel);

        // Environment with $zoom forced to integer to achieve stable interpolated values.
        const discreteZoomEnv = new MapEnv({ $zoom: discreteZoomLevel }, mapView.env);

        const defaultRenderParams = this.m_defaultStyle.renderParams;

        // Sets opacity to 1.0 if default and technique attribute are undefined.
        const defaultOpacity = getOptionValue(defaultRenderParams.opacity, 1.0);
        // Interpolate opacity but only on discreet zoom levels (step interpolation).
        let opacity = getPropertyValue(
            getOptionValue(technique.opacity, defaultOpacity),
            discreteZoomEnv
        );

        let color: THREE.Color | undefined;
        // Store color (RGB) in cache and multiply opacity value with the color alpha channel.
        if (technique.color !== undefined) {
            let hexColor = evaluateColorProperty(technique.color, discreteZoomEnv);
            if (hexColor !== undefined) {
                if (ColorUtils.hasAlphaInHex(hexColor)) {
                    const alpha = ColorUtils.getAlphaFromHex(hexColor);
                    opacity = opacity * alpha;
                    hexColor = ColorUtils.removeAlphaFromHex(hexColor);
                }
                color = ColorCache.instance.getColor(hexColor);
            }
        }

        // Sets background size to 0.0 if default and technique attribute is undefined.
        const defaultBackgroundSize = getOptionValue(
            defaultRenderParams.fontSize!.backgroundSize,
            0
        );
        const backgroundSize = getPropertyValue(
            getOptionValue(technique.backgroundSize, defaultBackgroundSize),
            discreteZoomEnv
        );

        const hasBackgroundDefined =
            technique.backgroundColor !== undefined &&
            technique.backgroundSize !== undefined &&
            backgroundSize > 0;

        // Sets background opacity to 1.0 if default and technique value is undefined while
        // background size and color is specified, otherwise set value in default render
        // params or 0.0 if neither set. Makes label opaque when backgroundColor and
        // backgroundSize are set.
        const defaultBackgroundOpacity = getOptionValue(defaultRenderParams.backgroundOpacity, 0.0);
        let backgroundOpacity = getPropertyValue(
            getOptionValue(
                technique.backgroundOpacity,
                hasBackgroundDefined ? 1.0 : defaultBackgroundOpacity
            ),
            discreteZoomEnv
        );

        let backgroundColor: THREE.Color | undefined;
        // Store background color (RGB) in cache and multiply backgroundOpacity by its alpha.
        if (technique.backgroundColor !== undefined) {
            let hexBgColor = evaluateColorProperty(technique.backgroundColor, discreteZoomEnv);
            if (hexBgColor !== undefined) {
                if (ColorUtils.hasAlphaInHex(hexBgColor)) {
                    const alpha = ColorUtils.getAlphaFromHex(hexBgColor);
                    backgroundOpacity = backgroundOpacity * alpha;
                    hexBgColor = ColorUtils.removeAlphaFromHex(hexBgColor);
                }
                backgroundColor = ColorCache.instance.getColor(hexBgColor);
            }
        }

        const renderParams = {
            fontName: getOptionValue(technique.fontName, defaultRenderParams.fontName),
            fontSize: {
                unit: FontUnit.Pixel,
                size: getPropertyValue(
                    getOptionValue(technique.size, defaultRenderParams.fontSize!.size),
                    discreteZoomEnv
                ),
                backgroundSize
            },
            fontStyle:
                technique.fontStyle === "Regular" ||
                technique.fontStyle === "Bold" ||
                technique.fontStyle === "Italic" ||
                technique.fontStyle === "BoldItalic"
                    ? FontStyle[technique.fontStyle]
                    : defaultRenderParams.fontStyle,
            fontVariant:
                technique.fontVariant === "Regular" ||
                technique.fontVariant === "AllCaps" ||
                technique.fontVariant === "SmallCaps"
                    ? FontVariant[technique.fontVariant]
                    : defaultRenderParams.fontVariant,
            rotation: getOptionValue(technique.rotation, defaultRenderParams.rotation),
            color: getOptionValue(
                color,
                getOptionValue(defaultRenderParams.color, DefaultTextStyle.DEFAULT_COLOR)
            ),
            backgroundColor: getOptionValue(
                backgroundColor,
                getOptionValue(
                    defaultRenderParams.backgroundColor,
                    DefaultTextStyle.DEFAULT_BACKGROUND_COLOR
                )
            ),
            opacity,
            backgroundOpacity
        };

        const themeRenderParams = this.getTextElementStyle(technique.style).renderParams;
        const renderStyle = new TextRenderStyle({
            ...themeRenderParams,
            ...renderParams
        });

        return renderStyle;
    }

    /**
     * Create the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param tile The [[Tile]] to process.
     * @param technique Label's technique.
     */
    createLayoutStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextLayoutStyle {
        const mapView = tile.mapView;
        const floorZoomLevel = Math.floor(tile.mapView.zoomLevel);

        const discreteZoomEnv = new MapEnv({ $zoom: floorZoomLevel }, mapView.env);

        const defaultLayoutParams = this.m_defaultStyle.layoutParams;

        const hAlignment = getPropertyValue(technique.hAlignment, discreteZoomEnv) as
            | string
            | undefined;
        const vAlignment = getPropertyValue(technique.vAlignment, discreteZoomEnv) as
            | string
            | undefined;
        const wrapping = getPropertyValue(technique.wrappingMode, discreteZoomEnv) as
            | string
            | undefined;

        const horizontalAlignment: HorizontalAlignment | undefined =
            hAlignment === "Left" || hAlignment === "Center" || hAlignment === "Right"
                ? HorizontalAlignment[hAlignment]
                : defaultLayoutParams.horizontalAlignment;

        const verticalAlignment: VerticalAlignment | undefined =
            vAlignment === "Above" || vAlignment === "Center" || vAlignment === "Below"
                ? VerticalAlignment[vAlignment]
                : defaultLayoutParams.verticalAlignment;

        const layoutParams = {
            tracking:
                getPropertyValue(technique.tracking, discreteZoomEnv) ??
                defaultLayoutParams.tracking,
            leading:
                getPropertyValue(technique.leading, discreteZoomEnv) ?? defaultLayoutParams.leading,
            maxLines:
                getPropertyValue(technique.maxLines, discreteZoomEnv) ??
                defaultLayoutParams.maxLines,
            lineWidth:
                getPropertyValue(technique.lineWidth, discreteZoomEnv) ??
                defaultLayoutParams.lineWidth,
            canvasRotation:
                getPropertyValue(technique.canvasRotation, discreteZoomEnv) ??
                defaultLayoutParams.canvasRotation,
            lineRotation:
                getPropertyValue(technique.lineRotation, discreteZoomEnv) ??
                defaultLayoutParams.lineRotation,
            wrappingMode:
                wrapping === "None" || wrapping === "Character" || wrapping === "Word"
                    ? WrappingMode[wrapping]
                    : defaultLayoutParams.wrappingMode,
            horizontalAlignment,
            verticalAlignment
        };

        const themeLayoutParams = this.getTextElementStyle(technique.style);
        const layoutStyle = new TextLayoutStyle({
            ...themeLayoutParams,
            ...layoutParams
        });

        return layoutStyle;
    }

    private createTextElementStyle(
        style: TextStyleDefinition,
        styleName: string
    ): TextElementStyle {
        return {
            name: styleName,
            fontCatalog: getOptionValue(style.fontCatalogName, this.m_defaultStyle.fontCatalog),
            renderParams: {
                fontName: style.fontName,
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: style.backgroundSize || 8
                },
                fontStyle:
                    style.fontStyle === "Regular" ||
                    style.fontStyle === "Bold" ||
                    style.fontStyle === "Italic" ||
                    style.fontStyle === "BoldItalic"
                        ? FontStyle[style.fontStyle]
                        : undefined,
                fontVariant:
                    style.fontVariant === "Regular" ||
                    style.fontVariant === "AllCaps" ||
                    style.fontVariant === "SmallCaps"
                        ? FontVariant[style.fontVariant]
                        : undefined,
                rotation: style.rotation,
                color:
                    style.color !== undefined
                        ? ColorCache.instance.getColor(style.color)
                        : undefined,
                backgroundColor:
                    style.backgroundColor !== undefined
                        ? ColorCache.instance.getColor(style.backgroundColor)
                        : undefined,
                opacity: style.opacity,
                backgroundOpacity: style.backgroundOpacity
            },
            layoutParams: {
                tracking: style.tracking,
                leading: style.leading,
                maxLines: style.maxLines,
                lineWidth: style.lineWidth,
                canvasRotation: style.canvasRotation,
                lineRotation: style.lineRotation,
                wrappingMode:
                    style.wrappingMode === "None" ||
                    style.wrappingMode === "Character" ||
                    style.wrappingMode === "Word"
                        ? WrappingMode[style.wrappingMode]
                        : WrappingMode.Word,
                verticalAlignment:
                    style.vAlignment === "Above" ||
                    style.vAlignment === "Center" ||
                    style.vAlignment === "Below"
                        ? VerticalAlignment[style.vAlignment]
                        : VerticalAlignment.Center,
                horizontalAlignment:
                    style.hAlignment === "Left" ||
                    style.hAlignment === "Center" ||
                    style.hAlignment === "Right"
                        ? HorizontalAlignment[style.hAlignment]
                        : HorizontalAlignment.Center
            }
        };
    }
}
