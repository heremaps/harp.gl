/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ColorUtils,
    IndexedTechniqueParams,
    LineMarkerTechnique,
    MapEnv,
    PoiTechnique,
    Technique,
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
import {
    getColorPropertyValueSafe,
    getEnumPropertyValueSafe,
    getNumberPropertyValueSafe
} from "../DecodedTileHelpers";
import { PoiRenderer } from "../poi/PoiRenderer";
import { Tile } from "../Tile";
import { TextCanvasRenderer } from "./TextCanvasRenderer";

const logger = LoggerManager.instance.create("TextStyleCache");

/**
 * [[TextStyle]] id for the default value inside a [[TextRenderStyleCache]] or a
 * [[TextLayoutStyleCache]].
 */
export const DEFAULT_TEXT_STYLE_CACHE_ID = "Default";

/**
 * Calculates the [[TextStyle]] id that identifies either a [[TextRenderStyle]] or a
 * [[TextLayoutStyle]] inside a [[TextRenderStyleCache]] or a [[TextLayoutStyleCache]],
 * respectively.
 *
 * @param technique Technique defining the [[TextStyle]].
 * @param zoomLevel Zoom level for which to interpret the technique.
 *
 * @returns [[TextStyle]] id.
 */
export function computeStyleCacheId(
    datasourceName: string,
    technique: Technique & Partial<IndexedTechniqueParams>,
    zoomLevel: number
): string {
    return `${datasourceName}_${technique._key}_${zoomLevel}`;
}

/**
 * Cache storing [[MapView]]'s [[TextRenderStyle]]s.
 */
export class TextRenderStyleCache {
    private m_map: Map<string, TextRenderStyle> = new Map();
    constructor() {
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextRenderStyle({
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: 8
                },
                color: ColorCache.instance.getColor("#6d7477"),
                opacity: 1.0,
                backgroundColor: ColorCache.instance.getColor("#f7fbfd"),
                backgroundOpacity: 0.5
            })
        );
    }

    get size(): number {
        return this.m_map.size;
    }

    get(id: string): TextRenderStyle | undefined {
        return this.m_map.get(id);
    }

    set(id: string, value: TextRenderStyle): void {
        this.m_map.set(id, value);
    }

    clear(): void {
        this.m_map.clear();
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextRenderStyle({
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: 32,
                    backgroundSize: 8
                },
                color: ColorCache.instance.getColor("#6d7477"),
                opacity: 1.0,
                backgroundColor: ColorCache.instance.getColor("#f7fbfd"),
                backgroundOpacity: 0.5
            })
        );
    }
}

/**
 * Cache storing [[MapView]]'s [[TextLayoutStyle]]s.
 */
export class TextLayoutStyleCache {
    private m_map: Map<string, TextLayoutStyle> = new Map();
    constructor() {
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextLayoutStyle({
                verticalAlignment: VerticalAlignment.Center,
                horizontalAlignment: HorizontalAlignment.Center
            })
        );
    }

    get size(): number {
        return this.m_map.size;
    }

    get(id: string): TextLayoutStyle | undefined {
        return this.m_map.get(id);
    }

    set(id: string, value: TextLayoutStyle): void {
        this.m_map.set(id, value);
    }

    clear(): void {
        this.m_map.clear();
        this.m_map.set(
            DEFAULT_TEXT_STYLE_CACHE_ID,
            new TextLayoutStyle({
                verticalAlignment: VerticalAlignment.Center,
                horizontalAlignment: HorizontalAlignment.Center
            })
        );
    }
}

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
    private m_textRenderStyleCache = new TextRenderStyleCache();
    private m_textLayoutStyleCache = new TextLayoutStyleCache();

    private m_textStyles: Map<string, TextElementStyle> = new Map();
    private m_defaultStyle: TextElementStyle = {
        name: DEFAULT_STYLE_NAME,
        fontCatalog: "",
        renderParams: this.m_textRenderStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!.params,
        layoutParams: this.m_textLayoutStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!.params
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
     *
     * @param technique Label's technique.
     * @param techniqueIdx Label's technique index.
     */
    getRenderStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextRenderStyle {
        const mapView = tile.mapView;
        const dataSource = tile.dataSource;
        const zoomLevel = mapView.zoomLevel;
        const discreteZoomLevel = Math.floor(zoomLevel);
        const cacheId = computeStyleCacheId(dataSource.name, technique, discreteZoomLevel);

        let renderStyle = this.m_textRenderStyleCache.get(cacheId);
        if (renderStyle === undefined) {
            // Environment with $zoom forced to integer to achieve stable interpolated values.
            const discreteZoomEnv = new MapEnv({ $zoom: discreteZoomLevel }, mapView.env);

            const defaultRenderParams = this.m_defaultStyle.renderParams;

            let opacity = getNumberPropertyValueSafe(
                technique.opacity,
                getOptionValue(defaultRenderParams.opacity, 1),
                discreteZoomEnv
            );

            let color: THREE.Color | undefined;
            let hexColor = getColorPropertyValueSafe(technique.color, undefined, discreteZoomEnv);
            if (hexColor !== undefined) {
                if (ColorUtils.hasAlphaInHex(hexColor)) {
                    const alpha = ColorUtils.getAlphaFromHex(hexColor);
                    opacity = opacity * alpha;
                    hexColor = ColorUtils.removeAlphaFromHex(hexColor);
                }
                color = ColorCache.instance.getColor(hexColor);
            }

            const backgroundSize = getNumberPropertyValueSafe(
                technique.backgroundSize,
                getOptionValue(defaultRenderParams.fontSize!.backgroundSize, 0),
                discreteZoomEnv
            );
            const hasBackgroundDefined =
                technique.backgroundColor !== undefined &&
                technique.backgroundSize !== undefined &&
                backgroundSize > 0;

            let hexBgColor = getColorPropertyValueSafe(
                technique.backgroundColor,
                undefined,
                discreteZoomEnv
            );

            // Sets background opacity to 1.0 if default and technique value is undefined while
            // background size and color is specified, otherwise set value in default render
            // params or 0.0 if neither set. Makes label opaque when backgroundColor and
            // backgroundSize are set.
            let backgroundOpacity = getNumberPropertyValueSafe(
                technique.backgroundOpacity,
                hasBackgroundDefined
                    ? 1.0
                    : getOptionValue(defaultRenderParams.backgroundOpacity, 0.0),
                discreteZoomEnv
            );

            let backgroundColor: THREE.Color | undefined;
            if (hexBgColor !== undefined) {
                if (ColorUtils.hasAlphaInHex(hexBgColor)) {
                    const alpha = ColorUtils.getAlphaFromHex(hexBgColor);
                    backgroundOpacity = backgroundOpacity * alpha;
                    hexBgColor = ColorUtils.removeAlphaFromHex(hexBgColor);
                }
                backgroundColor = ColorCache.instance.getColor(hexBgColor);
            }

            const renderParams = {
                fontName: getOptionValue(technique.fontName, defaultRenderParams.fontName),
                fontSize: {
                    unit: FontUnit.Pixel,
                    size: getNumberPropertyValueSafe(
                        technique.size,
                        defaultRenderParams.fontSize!.size,
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
                color: color || defaultRenderParams.color || DefaultTextStyle.DEFAULT_COLOR,
                backgroundColor:
                    backgroundColor ||
                    defaultRenderParams.backgroundColor ||
                    DefaultTextStyle.DEFAULT_BACKGROUND_COLOR,
                opacity,
                backgroundOpacity
            };

            const themeRenderParams = this.getTextElementStyle(technique.style).renderParams;
            renderStyle = new TextRenderStyle({
                ...themeRenderParams,
                ...renderParams
            });
            this.m_textRenderStyleCache.set(cacheId, renderStyle);
        }

        return renderStyle;
    }

    /**
     * Gets the appropriate [[TextRenderStyle]] to use for a label. Depends heavily on the label's
     * [[Technique]] and the current zoomLevel.
     *
     * @param tile The [[Tile]] to process.
     * @param technique Label's technique.
     */
    getLayoutStyle(
        tile: Tile,
        technique: TextTechnique | PoiTechnique | LineMarkerTechnique
    ): TextLayoutStyle {
        const mapView = tile.mapView;
        const floorZoomLevel = Math.floor(tile.mapView.zoomLevel);
        const cacheId = computeStyleCacheId(tile.dataSource.name, technique, floorZoomLevel);
        let layoutStyle = this.m_textLayoutStyleCache.get(cacheId);

        if (layoutStyle === undefined) {
            // Environment with $zoom forced to integer to achieve stable interpolated values.
            const discreteZoomEnv = new MapEnv({ $zoom: floorZoomLevel }, mapView.env);

            const defaultLayoutParams = this.m_defaultStyle.layoutParams;

            const horizontalAlignment = getEnumPropertyValueSafe(
                technique.hAlignment,
                HorizontalAlignment,
                getOptionValue(
                    defaultLayoutParams.horizontalAlignment,
                    DefaultTextStyle.DEFAULT_HORIZONTAL_ALIGNMENT
                ),
                discreteZoomEnv
            );
            const verticalAlignment = getEnumPropertyValueSafe(
                technique.vAlignment,
                VerticalAlignment,
                getOptionValue(
                    defaultLayoutParams.verticalAlignment,
                    DefaultTextStyle.DEFAULT_VERTICAL_ALIGNMENT
                ),
                discreteZoomEnv
            );

            const wrappingMode = getEnumPropertyValueSafe(
                technique.wrappingMode,
                WrappingMode,
                getOptionValue(
                    defaultLayoutParams.wrappingMode,
                    DefaultTextStyle.DEFAULT_WRAPPING_MODE
                ),

                discreteZoomEnv
            );

            const layoutParams = {
                tracking: getNumberPropertyValueSafe(
                    technique.tracking,
                    defaultLayoutParams.tracking,
                    discreteZoomEnv
                ),
                leading: getNumberPropertyValueSafe(
                    technique.leading,
                    defaultLayoutParams.leading,
                    discreteZoomEnv
                ),
                maxLines: getNumberPropertyValueSafe(
                    technique.maxLines,
                    defaultLayoutParams.maxLines,
                    discreteZoomEnv
                ),
                lineWidth: getNumberPropertyValueSafe(
                    technique.lineWidth,
                    defaultLayoutParams.lineWidth,
                    discreteZoomEnv
                ),
                canvasRotation: getNumberPropertyValueSafe(
                    technique.canvasRotation,
                    defaultLayoutParams.canvasRotation,
                    discreteZoomEnv
                ),
                lineRotation: getNumberPropertyValueSafe(
                    technique.lineRotation,
                    defaultLayoutParams.lineRotation,
                    discreteZoomEnv
                ),
                wrappingMode,
                horizontalAlignment,
                verticalAlignment
            };

            const themeLayoutParams = this.getTextElementStyle(technique.style);
            layoutStyle = new TextLayoutStyle({
                ...themeLayoutParams,
                ...layoutParams
            });
            this.m_textLayoutStyleCache.set(cacheId, layoutStyle);
        }

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
