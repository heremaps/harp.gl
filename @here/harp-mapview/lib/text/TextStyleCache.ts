/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    ColorUtils,
    getPropertyValue,
    isPoiTechnique,
    LineMarkerTechnique,
    MapEnv,
    PlacementToken,
    PoiTechnique,
    TextStyleDefinition,
    TextTechnique
} from "@here/harp-datasource-protocol";
import {
    DefaultTextStyle,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    HorizontalPlacement,
    resolvePlacementAndAlignment,
    TextCanvas,
    TextLayoutParameters,
    TextLayoutStyle,
    TextPlacement,
    TextPlacements,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    VerticalPlacement,
    WrappingMode
} from "@here/harp-text-canvas";
import { getOptionValue, LoggerManager } from "@here/harp-utils";

import { ColorCache } from "../ColorCache";
import { evaluateColorProperty } from "../DecodedTileHelpers";
import { Tile } from "../Tile";

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

// By default text layout provides no options for placement, but single alignment.
const defaultTextLayoutStyle = new TextLayoutStyle({
    verticalAlignment: VerticalAlignment.Center,
    horizontalAlignment: HorizontalAlignment.Center,
    placements: []
});

const DEFAULT_STYLE_NAME = "default";

/**
 * {@link TextElementsRenderer} representation of a
 * {@link @here/harp-datasource-protocol#Theme}'s TextStyle.
 */
export interface TextElementStyle {
    name: string;
    fontCatalog: string;
    renderParams: TextRenderParameters;
    layoutParams: TextLayoutParameters;
    textCanvas?: TextCanvas;
}

export class TextStyleCache {
    private readonly m_textStyles: Map<string, TextElementStyle> = new Map();
    private m_defaultStyle: TextElementStyle = {
        name: DEFAULT_STYLE_NAME,
        fontCatalog: "",
        renderParams: defaultTextRenderStyle.params,
        layoutParams: defaultTextLayoutStyle.params
    };

    constructor(
        private m_textStyleDefinitions?: TextStyleDefinition[],
        private readonly m_defaultTextStyleDefinition?: TextStyleDefinition
    ) {}

    initializeDefaultTextElementStyle(defaultFontCatalogName: string) {
        if (this.m_textStyleDefinitions === undefined) {
            this.m_textStyleDefinitions = [];
        }
        const styles = this.m_textStyleDefinitions;

        const themedDefaultStyle = styles.find(style => style.name === DEFAULT_STYLE_NAME);
        if (themedDefaultStyle !== undefined) {
            this.m_defaultStyle = this.createTextElementStyle(
                themedDefaultStyle,
                DEFAULT_STYLE_NAME
            );
        } else if (this.m_defaultTextStyleDefinition !== undefined) {
            this.m_defaultStyle = this.createTextElementStyle(
                this.m_defaultTextStyleDefinition,
                DEFAULT_STYLE_NAME
            );
        } else if (styles.length > 0) {
            this.m_defaultStyle = this.createTextElementStyle(styles[0], DEFAULT_STYLE_NAME);
        }
        this.m_defaultStyle.fontCatalog = defaultFontCatalogName;
    }

    initializeTextElementStyles(textCanvases: TextCanvas[]) {
        // Initialize default text style.
        if (this.m_defaultStyle.fontCatalog !== undefined) {
            const styledTextCanvas = textCanvases.find(
                textCanvas => textCanvas.fontCatalog.name === this.m_defaultStyle.fontCatalog
            );
            this.m_defaultStyle.textCanvas = styledTextCanvas;
        }
        if (this.m_defaultStyle.textCanvas === undefined) {
            if (this.m_defaultStyle.fontCatalog !== undefined) {
                logger.warn(
                    `FontCatalog '${this.m_defaultStyle.fontCatalog}' set in TextStyle
                     '${this.m_defaultStyle.name}' not found`
                );
            }
            if (textCanvases.length > 0) {
                this.m_defaultStyle.textCanvas = textCanvases[0];
                logger.info(`using default fontCatalog(${textCanvases[0].fontCatalog.name}).`);
            }
        }

        // Initialize theme text styles.
        this.m_textStyleDefinitions!.forEach(element => {
            this.m_textStyles.set(
                element.name!,
                this.createTextElementStyle(element, element.name!)
            );
        });
        for (const [, style] of this.m_textStyles) {
            if (style.textCanvas === undefined) {
                if (style.fontCatalog !== undefined) {
                    const styledTextCanvas = textCanvases.find(
                        textCanvas => textCanvas.fontCatalog.name === style.fontCatalog
                    );
                    style.textCanvas = styledTextCanvas;
                }
                if (style.textCanvas === undefined) {
                    if (style.fontCatalog !== undefined) {
                        logger.warn(
                            `FontCatalog '${style.fontCatalog}' set in TextStyle '${style.name}'
                            not found`
                        );
                    }
                    if (textCanvases.length > 0) {
                        style.textCanvas = textCanvases[0];
                        logger.info(
                            `using default fontCatalog(${textCanvases[0].fontCatalog.name}).`
                        );
                    }
                }
            }
        }
    }

    /**
     * Retrieves a {@link TextElementStyle} for {@link @here/harp-datasource-protocol#Theme}'s
     * [[TextStyle]] id.
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
     * Gets the appropriate {@link @here/harp-text-canvas#TextRenderStyle}
     * to use for a label. Depends heavily on the label's
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
     * Create the appropriate {@link @here/harp-text-canvas#TextLayoutStyle}
     * to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param tile - The {@link Tile} to process.
     * @param technique - Label's technique.
     */
    createLayoutStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextLayoutStyle {
        const mapView = tile.mapView;
        const floorZoomLevel = Math.floor(tile.mapView.zoomLevel);

        const discreteZoomEnv = new MapEnv({ $zoom: floorZoomLevel }, mapView.env);

        const defaultLayoutParams = this.m_defaultStyle.layoutParams;

        const hAlignment = getPropertyValue(technique.hAlignment, discreteZoomEnv) as string | null;
        const vAlignment = getPropertyValue(technique.vAlignment, discreteZoomEnv) as string | null;

        // Text alternative placements are currently supported only for PoiTechnique.
        const textPlacements = isPoiTechnique(technique)
            ? (getPropertyValue((technique as PoiTechnique).placements, discreteZoomEnv) as
                  | string
                  | null)
            : null;

        const { horizontalAlignment, verticalAlignment, placements } = parseAlignmentAndPlacements(
            hAlignment,
            vAlignment,
            textPlacements
        );

        const wrapping = getPropertyValue(technique.wrappingMode, discreteZoomEnv) as string | null;

        const wrappingMode =
            wrapping === "None" || wrapping === "Character" || wrapping === "Word"
                ? WrappingMode[wrapping]
                : defaultLayoutParams.wrappingMode;

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
            wrappingMode,
            horizontalAlignment,
            verticalAlignment,
            placements
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
        const { horizontalAlignment, verticalAlignment, placements } = parseAlignmentAndPlacements(
            style.hAlignment,
            style.vAlignment,
            style.placements
        );
        return {
            name: styleName,
            fontCatalog: getOptionValue(style.fontCatalogName, this.m_defaultStyle.fontCatalog),
            renderParams: {
                fontName: style.fontName,
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: style.backgroundSize ?? 8
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
                verticalAlignment,
                horizontalAlignment,
                placements
            }
        };
    }
}

function parseAlignmentAndPlacements(
    hAlignment: string | null | undefined,
    vAlignment: string | null | undefined,
    placementsTokens: string | null | undefined
): {
    horizontalAlignment: HorizontalAlignment;
    verticalAlignment: VerticalAlignment;
    placements: TextPlacements;
} {
    // Currently supported only for PoiTechnique.
    const placements: TextPlacements | undefined = placementsTokens
        ? parseTechniquePlacements(placementsTokens)
        : undefined;

    return resolvePlacementAndAlignment(
        parseTechniqueHAlignValue(hAlignment),
        parseTechniqueVAlignValue(vAlignment),
        placements
    );
}

function parseTechniqueHAlignValue(hAlignment: string | undefined | null): HorizontalAlignment {
    return hAlignment === "Left" || hAlignment === "Center" || hAlignment === "Right"
        ? HorizontalAlignment[hAlignment]
        : defaultTextLayoutStyle.horizontalAlignment;
}

function parseTechniqueVAlignValue(vAlignment: string | undefined | null): VerticalAlignment {
    return vAlignment === "Above" || vAlignment === "Center" || vAlignment === "Below"
        ? VerticalAlignment[vAlignment]
        : defaultTextLayoutStyle.verticalAlignment;
}

function parseTechniquePlacements(placementsString: string | undefined | null): TextPlacements {
    // Parse placement properties if available.
    const placements: TextPlacements = [];
    const placementsTokens = placementsString
        ? placementsString!
              .toUpperCase()
              .replace(" ", "")
              .split(",")
        : [];
    placementsTokens.forEach(p => {
        const val = parseTechniquePlacementValue(p);
        if (val !== undefined) {
            placements.push(val);
        }
    });
    return placements;
}

function parseTechniquePlacementValue(p: string): TextPlacement | undefined {
    // May be only literal of single or two characters.
    if (p.length < 1 || p.length > 2) {
        return undefined;
    }
    // If no value is specified for vertical/horizontal placement it is by default center.
    const textPlacement: TextPlacement = {
        h: HorizontalPlacement.Center,
        v: VerticalPlacement.Center
    };
    // Firstly try to find vertical placement.
    let modifier = p.charAt(0);
    let found: boolean = true;
    switch (modifier) {
        // Top / north
        case PlacementToken.Top:
        case PlacementToken.North:
            textPlacement.v = VerticalPlacement.Top;
            break;
        // Bottom / south
        case PlacementToken.Bottom:
        case PlacementToken.South:
            textPlacement.v = VerticalPlacement.Bottom;
            break;
        default:
            found = false;
            if (p.length === 2) {
                // For 2 characters tag both vertical/horizontal should be defined.
                return undefined;
            }
    }
    if (found && p.length === 1) {
        return textPlacement;
    }
    modifier = p.length === 1 ? p.charAt(0) : p.charAt(1);
    switch (modifier) {
        // Right / east
        case PlacementToken.Right:
        case PlacementToken.East:
            textPlacement.h = HorizontalPlacement.Right;
            break;
        // Left / west
        case PlacementToken.Left:
        case PlacementToken.West:
            textPlacement.h = HorizontalPlacement.Left;
            break;
        default:
            // Either for single character or multi-char tag, we must surrender.
            return undefined;
    }
    return textPlacement;
}
