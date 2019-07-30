/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LineMarkerTechnique, TextStyleDefinition, Theme } from "@here/harp-datasource-protocol";
import { ProjectionType } from "@here/harp-geoutils";
import {
    AdditionParameters,
    DEFAULT_TEXT_CANVAS_LAYER,
    FontCatalog,
    FontStyle,
    FontUnit,
    FontVariant,
    HorizontalAlignment,
    MeasurementParameters,
    TextBufferAdditionParameters,
    TextCanvas,
    TextLayoutParameters,
    TextLayoutStyle,
    TextRenderParameters,
    TextRenderStyle,
    VerticalAlignment,
    WrappingMode
} from "@here/harp-text-canvas";
import {
    getOptionValue,
    GroupedPriorityList,
    LoggerManager,
    Math2D,
    MathUtils,
    PerformanceTimer
} from "@here/harp-utils";
import * as THREE from "three";

import { ColorCache } from "../ColorCache";
import { DataSource } from "../DataSource";
import { debugContext } from "../DebugContext";
import { MapView } from "../MapView";
import { PickObjectType, PickResult } from "../PickHandler";
import { PoiRenderer } from "../poi/PoiRenderer";
import { ScreenCollisions } from "../ScreenCollisions";
import { ScreenProjector } from "../ScreenProjector";
import { Tile } from "../Tile";
import { MapViewUtils } from "../Utils";
import { SimpleLineCurve, SimplePath } from "./SimplePath";
import { FadingState, LoadingState, RenderState, TextElement, TextPickResult } from "./TextElement";
import { DEFAULT_TEXT_STYLE_CACHE_ID } from "./TextStyleCache";

const DEFAULT_STYLE_NAME = "default";
const DEFAULT_FONT_CATALOG_NAME = "default";
const MAX_INITIALIZED_TEXT_ELEMENTS_PER_FRAME = Infinity;
const MIN_GLYPH_COUNT = 1024;
const MAX_GLYPH_COUNT = 32768;

interface TextCanvasRenderer {
    fontCatalog: string;
    textCanvas: TextCanvas;
    poiRenderer: PoiRenderer;
}

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

/**
 * Default number of labels/POIs rendered in the scene
 */
const DEFAULT_MAX_NUM_RENDERED_TEXT_ELEMENTS = 500;

/**
 * Default distance scale. Will be applied if distanceScale is not defined in the technique.
 * Defines the scale that will be applied to labeled icons (icon and text) in the distance.
 */
export const DEFAULT_TEXT_DISTANCE_SCALE = 0.5;

/**
 * Number of elements that are put into second queue. This second chance queue is used to render
 * TextElements that have not been on screen before. This is a quick source for elements that can
 * appear when the camera moves a bit, before new elements are placed.
 */
const DEFAULT_MAX_NUM_SECOND_CHANCE_ELEMENTS = 300;

/**
 * Maximum distance for text labels expressed as a ratio of distance to from the camera (0) to the
 * far plane (1.0). May be synchronized with fog value ?
 */
const DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS = 0.99;

/**
 * Minimum scaling factor that may be applied to labels when their are distant from focus point.
 */
const DEFAULT_LABEL_DISTANCE_SCALE_MIN = 0.7;

/**
 * Maximum scaling factor that may be applied to labels due to their distance from focus point.
 */
const DEFAULT_LABEL_DISTANCE_SCALE_MAX = 1.5;

/**
 * Maximum number of recommended labels. If more labels are encountered, the "overloaded" mode is
 * set, which modifies the behavior of label placement and rendering, trying to keep delivering an
 * interactive performance. The overloaded mode should not be activated if the [[MapView]] is
 * rendering a static image (camera not moving and no animation running).
 */
const OVERLOAD_LABEL_LIMIT = 20000;

/**
 * If "overloaded" is `true`:
 *
 * Default number of labels/POIs placed in the scene. They are rendered only if they fit. If the
 * camera is not moving, it is ignored. See [[TextElementsRenderer.isDynamicFrame]].
 */
const OVERLOAD_PLACED_LABEL_LIMIT = 100;

/**
 * If "overloaded" is `true`:
 *
 * Maximum time in milliseconds available for placement. If value is <= 0, or if the camera is not
 * moving, it is ignored. See [[TextElementsRenderer.isDynamicFrame]].
 */
const OVERLOAD_PLACEMENT_TIME_LIMIT = 5;

/**
 * If "overloaded" is `true`:
 *
 * Maximum time in milliseconds available for rendering. If value is <= 0, or if the camera is not
 * moving, it is ignored. See [[TextElementsRenderer.isDynamicFrame]].
 */
const OVERLOAD_RENDER_TIME_LIMIT = 10;

/**
 * Minimum number of pixels per character. Used during estimation if there is enough screen space
 * available to render a text.
 */
const MIN_AVERAGE_CHAR_WIDTH = 5;

// Development flag: Enable debug print.
const PRINT_LABEL_DEBUG_INFO: boolean = false;

const logger = LoggerManager.instance.create("TextElementsRenderer");

const tempBox = new THREE.Box2();
const tempBoxes: THREE.Box2[] = [];
const tempBox2D = new Math2D.Box();

const tempPosition = new THREE.Vector3();
const tempPoiPosition = new THREE.Vector3(0, 0, 0);
const tempScreenPosition = new THREE.Vector2();
const tempPoiScreenPosition = new THREE.Vector2();

class TileTextElements {
    constructor(readonly tile: Tile, readonly textElements: TextElement[]) {}
}

class TextElementLists {
    constructor(readonly priority: number, readonly textElementLists: TileTextElements[]) {}

    /**
     * Sum up the number of elements in all lists.
     */
    count(): number {
        let n = 0;
        for (const list of this.textElementLists) {
            n += list.textElements.length;
        }
        return n;
    }
}

/**
 * @hidden
 *
 * Internal class to manage all text rendering.
 */
export class TextElementsRenderer {
    private m_initializedTextElementCount = 0;

    private m_textRenderers: TextCanvasRenderer[] = [];
    private m_textStyles: Map<string, TextElementStyle> = new Map();
    private m_defaultStyle: TextElementStyle = {
        name: DEFAULT_STYLE_NAME,
        fontCatalog: DEFAULT_FONT_CATALOG_NAME,
        renderParams: this.m_mapView.textRenderStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!.params,
        layoutParams: this.m_mapView.textLayoutStyleCache.get(DEFAULT_TEXT_STYLE_CACHE_ID)!.params
    };

    private m_lastRenderedTextElements: TextElement[] = [];
    private m_secondChanceTextElements: TextElement[] = [];

    // TODO: Replace this for an array of textures when more fonts are in use.
    private m_debugGlyphTextureCacheMesh?: THREE.Mesh;
    private m_debugGlyphTextureCacheWireMesh?: THREE.LineSegments;

    private m_tmpVector = new THREE.Vector2();
    private m_overloaded: boolean = false;
    private m_catalogsLoading: number = 0;

    /**
     * Create the `TextElementsRenderer` which selects which labels should be placed on screen as
     * a preprocessing step, which is not done every frame, and also renders the placed
     * [[TextElement]]s every frame.
     *
     * @param m_mapView MapView to render into
     * @param m_screenCollisions General 2D screen occlusion management, may be shared between
     *     instances.
     * @param m_screenProjector Projects 3D coordinates into screen space.
     * @param m_minNumGlyphs Minimum number of glyphs (per-layer). Controls the size of internal
     * buffers.
     * @param m_maxNumGlyphs Maximum number of glyphs (per-layer). Controls the size of internal
     * buffers.
     * @param m_theme Theme defining  text styles.
     * @param m_maxNumVisibleLabels Maximum number of visible [[TextElement]]s.
     * @param m_numSecondChanceLabels Number of [[TextElement]] that will be rendered again.
     * @param m_maxDistanceRatioForTextLabels Maximum distance for pure [[TextElement]], at which
     *          it should still be rendered, expressed as a fraction of the distance between
     *          the near and far plane [0, 1.0]. Defaults to
     *          [[DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS]].
     * @param m_maxDistanceRatioForPoiLabels Maximum distance for [[TextElement]] with icon,
     *          expressed as a fraction of the distance between the near and far plane [0, 1.0].
     *          Defaults to [[DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS]].
     * @param m_labelDistanceScaleMin Minimum scale factor that may be applied to [[TextElement]]s
     *          due to its disctance from focus point. Defaults to `0.7`.
     * @param m_labelDistanceScaleMax Maximum scale factor that may be applied to [[TextElement]]s
     *          due to its distance from focus point. Defaults to `1.5`.
     */
    constructor(
        private m_mapView: MapView,
        private m_screenCollisions: ScreenCollisions,
        private m_screenProjector: ScreenProjector,
        private m_minNumGlyphs: number | undefined,
        private m_maxNumGlyphs: number | undefined,
        private m_theme: Theme,
        private m_maxNumVisibleLabels: number | undefined,
        private m_numSecondChanceLabels: number | undefined,
        private m_labelDistanceScaleMin: number | undefined,
        private m_labelDistanceScaleMax: number | undefined,
        private m_maxDistanceRatioForTextLabels: number | undefined,
        private m_maxDistanceRatioForPoiLabels: number | undefined
    ) {
        if (this.m_minNumGlyphs === undefined) {
            this.m_minNumGlyphs = MIN_GLYPH_COUNT;
        }
        if (this.m_maxNumGlyphs === undefined) {
            this.m_maxNumGlyphs = MAX_GLYPH_COUNT;
        }
        if (this.m_maxNumVisibleLabels === undefined) {
            this.m_maxNumVisibleLabels = DEFAULT_MAX_NUM_RENDERED_TEXT_ELEMENTS;
        }
        if (this.m_numSecondChanceLabels === undefined) {
            this.m_numSecondChanceLabels = DEFAULT_MAX_NUM_SECOND_CHANCE_ELEMENTS;
        }
        if (this.m_labelDistanceScaleMin === undefined) {
            this.m_labelDistanceScaleMin = DEFAULT_LABEL_DISTANCE_SCALE_MIN;
        }
        if (this.m_labelDistanceScaleMax === undefined) {
            this.m_labelDistanceScaleMax = DEFAULT_LABEL_DISTANCE_SCALE_MAX;
        }
        if (this.m_maxDistanceRatioForTextLabels === undefined) {
            this.m_maxDistanceRatioForTextLabels = DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS;
        }
        if (this.m_maxDistanceRatioForPoiLabels === undefined) {
            this.m_maxDistanceRatioForPoiLabels = DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS;
        }

        this.initializeDefaultAssets();
        this.initializeTextCanvases();
    }

    /**
     * Render the text using the specified camera into the current canvas.
     *
     * @param camera Orthographic camera to use.
     */
    renderText(camera: THREE.OrthographicCamera) {
        const debugGlyphs = debugContext.getValue("DEBUG_GLYPHS");
        if (
            debugGlyphs !== undefined &&
            this.m_debugGlyphTextureCacheMesh !== undefined &&
            this.m_debugGlyphTextureCacheWireMesh !== undefined
        ) {
            this.m_debugGlyphTextureCacheMesh.visible = debugGlyphs;
            this.m_debugGlyphTextureCacheWireMesh.visible = debugGlyphs;
        }
        for (const textRenderer of this.m_textRenderers) {
            textRenderer.textCanvas.render(camera);
        }
    }

    /**
     * Reset internal state at the beginning of a frame.
     */
    reset() {
        this.m_screenCollisions.reset();
        for (const textRenderer of this.m_textRenderers) {
            textRenderer.textCanvas.clear();
            textRenderer.poiRenderer.reset();
        }
        this.m_initializedTextElementCount = 0;
    }

    /**
     * Update the geometries at the end of a frame before rendering them.
     */
    update() {
        for (const textRenderer of this.m_textRenderers) {
            textRenderer.poiRenderer.update();
        }
    }

    /**
     * Visit all visible tiles and place their text labels and POI icons. The placement of
     * [[TextElement]]s is a time consuming process, and cannot be done every frame, but should only
     * be done when the camera moved (a lot) of whenever the set of visible tiles change.
     *
     * The actually rendered [[TextElement]]s are stored internally until the next placement is done
     * to speed up rendering when no camera movement was detected.
     */
    placeAllTileLabels() {
        this.placeAllLabels();
    }

    /**
     * Notify `TextElementsRenderer` that the camera has started a movement.
     */
    movementStarted() {
        // Nothing to do (yet)
    }

    /**
     * Notify `TextElementsRenderer` that the camera has finished its movement.
     */
    movementFinished() {
        this.placeAllLabels();
    }

    /**
     * Default [[TextElementStyle]] used to render [[TextElement]]s.
     */
    get defaultStyle(): TextElementStyle {
        return this.m_defaultStyle;
    }

    /**
     * Is `true` if number of [[TextElement]]s in visible tiles is larger than the recommended
     * number `OVERLOAD_LABEL_LIMIT`.
     */
    get overloaded(): boolean {
        return this.m_overloaded;
    }

    /**
     * Render the user [[TextElement]]s.
     *
     * @param time Current time for animations.
     * @param frameNumber Integer number incremented every frame.
     */
    renderUserTextElements(time: number, frameNumber: number) {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;
        const zoomLevel = this.m_mapView.zoomLevel;

        // Render the user POIs first
        renderList.forEach(renderListEntry => {
            for (const tile of renderListEntry.visibleTiles) {
                for (const textElement of tile.userTextElements) {
                    // update distance
                    textElement.tileCenter = tile.center;
                    this.updateViewDistance(this.m_mapView.worldCenter, textElement);
                }

                this.renderTextElements(tile.userTextElements, time, frameNumber, zoomLevel);
            }
        });
    }

    /**
     * Re-render the previously placed [[TextElement]]s.
     *
     * @param time Current time for animations.
     * @param frameNumber Integer number incremented every frame.
     */
    renderAllTileText(time: number, frameNumber: number) {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;
        const zoomLevel = this.m_mapView.zoomLevel;

        this.checkIfOverloaded();

        if (this.m_lastRenderedTextElements.length === 0) {
            const renderStartTime =
                this.overloaded && this.m_mapView.isDynamicFrame
                    ? PerformanceTimer.now()
                    : undefined;

            // Nothing has been rendered before, process the list of placed labels in all tiles.
            renderList.forEach(renderListEntry => {
                this.renderTileList(
                    renderListEntry.renderedTiles,
                    time,
                    frameNumber,
                    zoomLevel,
                    renderStartTime,
                    this.m_lastRenderedTextElements,
                    this.m_secondChanceTextElements
                );
            });
        } else {
            //TODO: Avoid list allocation
            const allRenderableTextElements = this.m_lastRenderedTextElements.concat(
                this.m_secondChanceTextElements
            );
            this.renderTextElements(allRenderableTextElements, time, frameNumber, zoomLevel);
        }
    }

    /**
     * Render the [[TextElement]]s that are not part of the scene, but the overlay. Useful if a UI
     * with text or just plain information in the canvas itself should be presented to the user,
     * instead of using an HTML layer.
     *
     * @param textElements List of [[TextElement]]s in the overlay.
     */
    renderOverlay(textElements: TextElement[] | undefined) {
        if (textElements === undefined || textElements.length === 0) {
            return;
        }

        this.renderOverlayTextElements(textElements);
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * [[TextElement]]s are found, the order of the results is unspecified.
     *
     * Note: [[TextElement]]s with identical `featureId` or identical `userData` will only appear
     * once in the list `pickResults`.
     *
     * @param screenPosition Screen coordinate of picking position.
     * @param pickResults Array filled with pick results.
     */
    pickTextElements(screenPosition: THREE.Vector2, pickResults: PickResult[]) {
        const pickHandler = (pickData: any | undefined, pickObjectType: PickObjectType) => {
            const textElement = pickData as TextElement;

            if (textElement === undefined) {
                return;
            }

            let isDuplicate = false;

            if (textElement.featureId !== undefined) {
                isDuplicate = pickResults.some(pickResult => {
                    return (
                        pickResult !== undefined &&
                        pickObjectType === pickResult.type &&
                        ((pickResult.featureId !== undefined &&
                            pickResult.featureId === textElement.featureId) ||
                            (pickResult.userData !== undefined &&
                                pickResult.userData === textElement.userData))
                    );
                });

                if (!isDuplicate) {
                    const pickResult: TextPickResult = {
                        type: pickObjectType,
                        point: screenPosition,
                        distance: 0,
                        featureId: textElement.featureId,
                        userData: textElement.userData,
                        text: textElement.text
                    };

                    pickResults.push(pickResult);
                }
            }
        };

        for (const textRenderer of this.m_textRenderers) {
            textRenderer.textCanvas.pickText(screenPosition, (pickData: any | undefined) => {
                pickHandler(pickData, PickObjectType.Text);
            });
            textRenderer.poiRenderer.pickTextElements(
                screenPosition,
                (pickData: any | undefined) => {
                    pickHandler(pickData, PickObjectType.Icon);
                }
            );
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
     * `true` if font catalogs are ready, that means all font catalogs are initialized.
     */
    get ready(): boolean {
        return this.m_catalogsLoading === 0 && this.m_textRenderers.length > 0;
    }

    /**
     * `true` if any resource used by any `FontCatalog` is still loading.
     */
    get loading(): boolean {
        let isLoading = this.m_catalogsLoading > 0;
        for (const textRenderer of this.m_textRenderers) {
            isLoading = isLoading || textRenderer.textCanvas.fontCatalog.isLoading;
        }
        return isLoading;
    }

    /**
     * Reset the current text render states of all visible tiles. All [[TextElement]]s will fade in
     * after that as if they have just been added.
     */
    clearRenderStates() {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;

        renderList.forEach(renderListEntry => {
            for (const tile of renderListEntry.visibleTiles) {
                // Reset the render states, handle them as if they were just added to the tile.
                tile.userTextElements.forEach(textElement => {
                    textElement.iconRenderState = undefined;
                    textElement.textRenderState = undefined;
                });
                tile.textElementGroups.forEach(textElement => {
                    textElement.iconRenderState = undefined;
                    textElement.textRenderState = undefined;
                });
            }
        });
    }

    /**
     * Return memory used by all objects managed by `TextElementsRenderer`.
     *
     * @returns `MemoryUsage` Heap and GPU memory used by this `TextElementsRenderer`.
     */
    getMemoryUsage(): MapViewUtils.MemoryUsage {
        const memoryUsage = {
            heapSize: 0,
            gpuSize: 0
        };

        for (const renderer of this.m_textRenderers) {
            renderer.textCanvas.getMemoryUsage(memoryUsage);
            renderer.poiRenderer.getMemoryUsage(memoryUsage);
        }

        return memoryUsage;
    }

    private initializeDefaultAssets(): void {
        // Initialize default font catalog.
        if (
            this.m_theme.fontCatalogs === undefined ||
            (Array.isArray(this.m_theme.fontCatalogs) && this.m_theme.fontCatalogs.length === 0)
        ) {
            this.m_theme.fontCatalogs = [
                {
                    name: DEFAULT_FONT_CATALOG_NAME,
                    url: this.m_mapView.defaultFontCatalog
                }
            ];
        }
        const fontCatalogs = this.m_theme.fontCatalogs;

        let defaultFontCatalogName: string | undefined;
        if (fontCatalogs.length > 0) {
            for (const fontCatalog of fontCatalogs) {
                if (fontCatalog.name !== undefined) {
                    defaultFontCatalogName = fontCatalog.name;
                    break;
                }
            }
            if (defaultFontCatalogName === undefined) {
                defaultFontCatalogName = DEFAULT_FONT_CATALOG_NAME;
                fontCatalogs[0].name = defaultFontCatalogName;
            }
        }

        // Initialize default text style.
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
        this.m_defaultStyle.fontCatalog = defaultFontCatalogName!;
    }

    private createTextElementStyle(
        style: TextStyleDefinition,
        styleName: string
    ): TextElementStyle {
        return {
            name: styleName,
            fontCatalog: getOptionValue(style.fontCatalogName, DEFAULT_FONT_CATALOG_NAME),
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

    private initializeTextCanvases(): void {
        const promises: Array<Promise<void>> = [];
        this.m_theme.fontCatalogs!.forEach(fontCatalogConfig => {
            this.m_catalogsLoading += 1;
            const fontCatalogPromise: Promise<void> = FontCatalog.load(fontCatalogConfig.url, 1024)
                .then((loadedFontCatalog: FontCatalog) => {
                    const loadedTextCanvas = new TextCanvas({
                        renderer: this.m_mapView.renderer,
                        fontCatalog: loadedFontCatalog,
                        minGlyphCount: this.m_minNumGlyphs!,
                        maxGlyphCount: this.m_maxNumGlyphs!
                    });

                    this.m_textRenderers.push({
                        fontCatalog: fontCatalogConfig.name,
                        textCanvas: loadedTextCanvas,
                        poiRenderer: new PoiRenderer(this.m_mapView, loadedTextCanvas)
                    });
                })
                .catch((error: Error) => {
                    logger.error("Failed to load FontCatalog: ", error);
                })
                .finally(() => {
                    this.m_catalogsLoading -= 1;
                });
            promises.push(fontCatalogPromise);
        });

        Promise.all(promises).then(() => {
            this.initializeTextElementStyles();

            const defaultFontCatalog = this.m_textRenderers[0].textCanvas.fontCatalog;

            // Initialize glyph-debugging mesh.
            const planeGeometry = new THREE.PlaneGeometry(
                defaultFontCatalog.textureSize.width / 2.5,
                defaultFontCatalog.textureSize.height / 2.5,
                defaultFontCatalog.textureSize.width / defaultFontCatalog.maxWidth,
                defaultFontCatalog.textureSize.height / defaultFontCatalog.maxHeight
            );
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                depthWrite: false,
                depthTest: false,
                map: defaultFontCatalog.texture
            });
            this.m_debugGlyphTextureCacheMesh = new THREE.Mesh(planeGeometry, material);
            this.m_debugGlyphTextureCacheMesh.renderOrder = 10000;
            this.m_debugGlyphTextureCacheMesh.visible = false;

            this.m_debugGlyphTextureCacheMesh.name = "glyphDebug";

            const wireframe = new THREE.WireframeGeometry(planeGeometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({
                transparent: true,
                color: 0x999999,
                depthWrite: false,
                depthTest: false
            });
            this.m_debugGlyphTextureCacheWireMesh = new THREE.LineSegments(
                wireframe,
                wireframeMaterial
            );
            this.m_debugGlyphTextureCacheWireMesh.renderOrder = 9999;
            this.m_debugGlyphTextureCacheWireMesh.visible = false;

            this.m_debugGlyphTextureCacheWireMesh.name = "glyphDebug";

            this.m_textRenderers[0].textCanvas
                .getLayer(DEFAULT_TEXT_CANVAS_LAYER)!
                .storage.scene.add(
                    this.m_debugGlyphTextureCacheMesh,
                    this.m_debugGlyphTextureCacheWireMesh
                );

            this.m_mapView.update();
        });
    }

    private initializeTextElementStyles() {
        // Find the default TextCanvas and PoiRenderer.
        let defaultTextCanvas: TextCanvas | undefined;
        this.m_textRenderers.forEach(textRenderer => {
            if (defaultTextCanvas === undefined) {
                defaultTextCanvas = textRenderer.textCanvas;
            }
        });
        const defaultPoiRenderer = new PoiRenderer(this.m_mapView, defaultTextCanvas!);

        // Initialize default text style.
        if (this.m_defaultStyle.fontCatalog !== undefined) {
            const styledTextRenderer = this.m_textRenderers.find(
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
        for (const [name, style] of this.m_textStyles) {
            if (style.textCanvas === undefined) {
                if (style.fontCatalog !== undefined) {
                    const styledTextRenderer = this.m_textRenderers.find(
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

    private updateViewDistance(
        worldCenter: THREE.Vector3,
        textElement: TextElement
    ): number | undefined {
        let viewDistance: number | undefined;

        if (Array.isArray(textElement.points) && textElement.points.length > 1) {
            tempPoiPosition.copy(textElement.points[0]).add(textElement.tileCenter!);
            const viewDistance0 = worldCenter.distanceTo(tempPoiPosition);

            tempPoiPosition
                .copy(textElement.points[textElement.points.length - 1])
                .add(textElement.tileCenter!);
            const viewDistance1 = worldCenter.distanceTo(tempPoiPosition);

            viewDistance = Math.min(viewDistance0, viewDistance1);
        } else {
            tempPoiPosition.copy(textElement.position).add(textElement.tileCenter!);
            viewDistance = worldCenter.distanceTo(tempPoiPosition);
        }

        textElement.currentViewDistance = viewDistance;
        return viewDistance;
    }

    private sortTextElements(textElements: TextElement[], maxViewDistance: number) {
        const distancePriorityFactor = 0.1;
        const indexPriorityFactor = 0.01 * (1 / textElements.length);

        // Compute the sortPriority once for all elements, because the computation is done more
        // than once per element. Also, make sorting stable by taking the index into the array into
        // account, this is required to get repeatable results for testing.
        for (let i = 0; i < textElements.length; i++) {
            const textElement = textElements[i];

            textElement.sortPriority =
                textElement.priority +
                i * indexPriorityFactor +
                distancePriorityFactor -
                distancePriorityFactor * (textElement.currentViewDistance! / maxViewDistance);
        }

        // Do the actual sort based on sortPriority
        textElements.sort((a: TextElement, b: TextElement) => {
            return b.sortPriority! - a.sortPriority!;
        });
    }

    private placeAllLabels() {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;
        const zoomLevel = this.m_mapView.zoomLevel;

        this.checkIfOverloaded();

        const placementStartTime =
            this.overloaded && this.m_mapView.isDynamicFrame ? PerformanceTimer.now() : undefined;

        renderList.forEach(tileList => {
            this.placeTextElements(
                tileList.dataSource,
                tileList.storageLevel,
                zoomLevel,
                tileList.visibleTiles,
                placementStartTime
            );
        });

        this.m_lastRenderedTextElements.length = 0;
        this.m_secondChanceTextElements.length = 0;
    }

    private placeTextElements(
        tileDataSource: DataSource,
        storageLevel: number,
        zoomLevel: number,
        visibleTiles: Tile[],
        placementStartTime: number | undefined
    ) {
        const sortedTiles = visibleTiles;

        sortedTiles.sort((a: Tile, b: Tile) => {
            return a.tileKey.mortonCode() - b.tileKey.mortonCode();
        });

        for (const tile of sortedTiles) {
            this.prepareUserTextElements(tile);
        }

        const sortedGroups: TextElementLists[] = [];
        this.createSortedGroupsForSorting(tileDataSource, storageLevel, sortedTiles, sortedGroups);

        const textElementGroups: TextElement[][] = [];

        let numTextElementsPlaced = 0;

        for (const textElementLists of sortedGroups) {
            this.selectTextElementsToPlaceByDistance(
                zoomLevel,
                textElementLists,
                textElementGroups
            );

            // The value of placementStartTime is set if this.overloaded is true.
            if (placementStartTime !== undefined) {
                // If overloaded and all time is used up, exit early.
                if (OVERLOAD_PLACEMENT_TIME_LIMIT > 0) {
                    const endTime = PerformanceTimer.now();
                    const elapsedTime = endTime - placementStartTime;
                    if (elapsedTime > OVERLOAD_PLACEMENT_TIME_LIMIT) {
                        break;
                    }
                }

                // Try not to place too many elements. They will be checked for visibility each
                // frame.
                numTextElementsPlaced += textElementLists.count();
                if (numTextElementsPlaced >= OVERLOAD_PLACED_LABEL_LIMIT) {
                    break;
                }
            }
        }
    }

    /**
     * Process any (new) user [[TextElement]], which has not been placed by the PoiManager, to set
     * it up for rendering.
     *
     * @param tile The Tile to process all user [[TextElements]] of.
     */
    private prepareUserTextElements(tile: Tile) {
        for (const textElement of tile.userTextElements) {
            textElement.tileCenter = tile.center;
        }
    }

    private createSortedGroupsForSorting(
        tileDataSource: DataSource,
        storageLevel: number,
        sortedTiles: Tile[],
        sortedGroups: TextElementLists[]
    ) {
        if (this.m_textRenderers.length === 0 || sortedTiles.length === 0) {
            return;
        }

        const tilesToRender: Tile[] = [];

        for (const tile of sortedTiles) {
            tile.placedTextElements.clear();
            if (tileDataSource.shouldRenderText(storageLevel, tile.tileKey)) {
                tilesToRender.push(tile);
            }
        }

        const groupedPriorityLists: Map<number, TextElementLists> = new Map();

        for (const tile of tilesToRender) {
            for (const group of tile.textElementGroups.groups.values()) {
                if (group.elements.length === 0) {
                    continue;
                }
                const foundGroup = groupedPriorityLists.get(group.priority);
                if (foundGroup === undefined) {
                    groupedPriorityLists.set(
                        group.priority,
                        new TextElementLists(group.priority, [
                            new TileTextElements(tile, group.elements)
                        ])
                    );
                } else {
                    foundGroup.textElementLists.push(new TileTextElements(tile, group.elements));
                }
            }
        }

        if (groupedPriorityLists.size === 0) {
            return;
        }

        for (const g of groupedPriorityLists) {
            const lists = g[1];
            sortedGroups.push(lists);
        }

        sortedGroups.sort((a: TextElementLists, b: TextElementLists) => {
            return b.priority - a.priority;
        });

        const printTextInfo = false;

        if (PRINT_LABEL_DEBUG_INFO && printTextInfo) {
            let outString = "";
            for (const textElementLists of sortedGroups) {
                let size = 0;
                for (const tileTextElements of textElementLists.textElementLists) {
                    size += tileTextElements.textElements.length;
                }
                outString += `priority ${textElementLists.priority} size: ${size}\n`;
            }
            logger.log(outString);
        }
    }

    private getMaxDistance(farDistanceLimitRatio: number): number {
        const farDistance = this.m_mapView.camera.far;
        const maxDistance = farDistance * farDistanceLimitRatio;
        return maxDistance;
    }

    private selectTextElementsToPlaceByDistance(
        zoomLevel: number,
        textElementLists: TextElementLists,
        textElementGroups: TextElement[][]
    ) {
        const farDistanceLimitRatio = Math.max(
            this.m_maxDistanceRatioForTextLabels!,
            this.m_maxDistanceRatioForPoiLabels!
        );
        const maxDistance = this.getMaxDistance(farDistanceLimitRatio);

        const textElementGroup: TextElement[] = [];
        for (const tileTextElements of textElementLists.textElementLists) {
            const tile = tileTextElements.tile;
            const worldOffsetX = this.m_mapView.projection.worldExtent(0, 0).max.x * tile.offset;
            for (const textElement of tileTextElements.textElements) {
                if (!textElement.visible) {
                    continue;
                }

                // If a PoiTable is specified in the technique, the table is required to be
                // loaded before the POI can be rendered.
                if (
                    textElement.poiInfo !== undefined &&
                    textElement.poiInfo.poiTableName !== undefined
                ) {
                    if (this.m_mapView.poiManager.updatePoiFromPoiTable(textElement)) {
                        // Remove poiTableName to mark this POI as processed.
                        textElement.poiInfo.poiTableName = undefined;
                    } else {
                        // PoiTable has not been loaded, but is required to determine
                        // visibility.
                        continue;
                    }
                }

                if (
                    !textElement.visible ||
                    !MathUtils.isClamped(
                        zoomLevel,
                        textElement.minZoomLevel,
                        textElement.maxZoomLevel
                    )
                ) {
                    continue;
                }

                if (textElement.tileCenter === undefined) {
                    textElement.tileCenter = new THREE.Vector3(
                        tile.center.x + worldOffsetX,
                        tile.center.y,
                        tile.center.z
                    );
                } else {
                    textElement.tileCenter.set(
                        tile.center.x + worldOffsetX,
                        tile.center.y,
                        tile.center.z
                    );
                }

                // If the distance is greater than allowed, skip it.
                const textDistance = this.updateViewDistance(
                    this.m_mapView.worldCenter,
                    textElement
                );
                if (this.m_mapView.projection.type === ProjectionType.Spherical) {
                    tempPoiPosition.copy(textElement.position).add(textElement.tileCenter!);
                    tempPoiPosition.normalize();
                    const cameraDir = new THREE.Vector3();
                    this.m_mapView.camera.getWorldDirection(cameraDir);
                    if (
                        tempPoiPosition.dot(cameraDir) < -0.6 &&
                        textDistance !== undefined &&
                        textDistance <= maxDistance
                    ) {
                        tile.placedTextElements.add(textElement);
                    }
                } else if (textDistance !== undefined && textDistance <= maxDistance) {
                    tile.placedTextElements.add(textElement);
                }
            }
        }
        textElementGroups.push(textElementGroup);
    }

    private renderOverlayTextElements(textElements: TextElement[]) {
        if (this.m_textRenderers.length === 0) {
            return;
        }

        const screenSize = this.m_mapView.renderer.getSize(this.m_tmpVector);
        const screenXOrigin = -screenSize.width / 2.0;
        const screenYOrigin = screenSize.height / 2.0;

        const tempAdditionParams: AdditionParameters = {};
        const tempBufferAdditionParams: TextBufferAdditionParameters = {};

        // Place text elements one by one.
        for (const textElement of textElements) {
            // Get the TextElementStyle.
            const textElementStyle = this.getTextElementStyle(textElement.style);
            const textCanvas = textElementStyle.textCanvas;
            if (textCanvas === undefined) {
                continue;
            }
            const layer = textCanvas.getLayer(textElement.renderOrder || DEFAULT_TEXT_CANVAS_LAYER);

            const isPathLabel = textElement.path !== undefined && !textElement.isLineMarker;

            // Trigger the glyph load if needed.
            if (textElement.loadingState === undefined) {
                textElement.loadingState = LoadingState.Requested;

                if (textElement.renderStyle === undefined) {
                    textElement.renderStyle = new TextRenderStyle({
                        ...textElementStyle.renderParams,
                        ...textElement.renderParams
                    });
                }
                if (textElement.layoutStyle === undefined) {
                    textElement.layoutStyle = new TextLayoutStyle({
                        ...textElementStyle.layoutParams,
                        ...textElement.layoutParams
                    });
                }

                if (textElement.text === "") {
                    textElement.loadingState = LoadingState.Loaded;
                } else {
                    textCanvas.fontCatalog
                        .loadCharset(textElement.text, textElement.renderStyle)
                        .then(() => {
                            textElement.loadingState = LoadingState.Loaded;
                            this.m_mapView.update();
                        });
                }
            }
            if (textElement.loadingState === LoadingState.Loaded) {
                if (this.m_initializedTextElementCount < MAX_INITIALIZED_TEXT_ELEMENTS_PER_FRAME) {
                    textCanvas.textRenderStyle = textElement.renderStyle!;
                    textCanvas.textLayoutStyle = textElement.layoutStyle!;
                    textElement.glyphCaseArray = [];
                    textElement.glyphs = textCanvas.fontCatalog.getGlyphs(
                        textElement.text,
                        textCanvas.textRenderStyle,
                        textElement.glyphCaseArray
                    );
                    textElement.loadingState = LoadingState.Initialized;
                    ++this.m_initializedTextElementCount;
                }
            }
            if (textElement.loadingState !== LoadingState.Initialized) {
                continue;
            }

            // Move onto the next TextElement if we cannot continue adding glyphs to this layer.
            if (layer !== undefined) {
                if (layer.storage.drawCount + textElement.glyphs!.length > layer.storage.capacity) {
                    continue;
                }
            }

            // Set the current style for the canvas.
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;

            // Place text.
            let textPath;
            if (!isPathLabel) {
                // Adjust the label positioning.
                tempScreenPosition.x = screenXOrigin + textElement.position.x * screenSize.width;
                tempScreenPosition.y = screenYOrigin - textElement.position.y * screenSize.height;
                if (textElement.xOffset !== undefined) {
                    tempScreenPosition.x += textElement.xOffset;
                }
                if (textElement.yOffset !== undefined) {
                    tempScreenPosition.y -= textElement.yOffset;
                }

                tempPosition.x = tempScreenPosition.x;
                tempPosition.y = tempScreenPosition.y;
                tempPosition.z = 0.0;

                tempBufferAdditionParams.position = tempPosition;
                tempAdditionParams.layer = textElement.renderOrder;
                tempAdditionParams.letterCaseArray = textElement.glyphCaseArray;
                tempAdditionParams.pickingData = textElement.userData ? textElement : undefined;
                textCanvas.addText(textElement.glyphs!, tempPosition, tempAdditionParams);
            } else {
                // Adjust the label positioning.
                tempScreenPosition.x = screenXOrigin;
                tempScreenPosition.y = screenYOrigin;
                if (textElement.xOffset !== undefined) {
                    tempScreenPosition.x += textElement.xOffset;
                }
                if (textElement.yOffset !== undefined) {
                    tempScreenPosition.y -= textElement.yOffset;
                }

                // Get the screen points that define the label's segments and create a path with
                // them.
                // TODO: Optimize array allocations.
                const screenPoints: THREE.Vector2[] = [];
                for (const pt of textElement.path!) {
                    const pX = tempScreenPosition.x + pt.x * screenSize.width;
                    const pY = tempScreenPosition.y - pt.y * screenSize.height;
                    screenPoints.push(new THREE.Vector2(pX, pY));
                }
                textPath = new SimplePath();
                for (let i = 0; i < screenPoints.length - 1; ++i) {
                    textPath.add(new THREE.LineCurve(screenPoints[i], screenPoints[i + 1]));
                }

                tempAdditionParams.path = textPath;
                tempAdditionParams.pathOverflow = true;
                tempAdditionParams.layer = textElement.renderOrder;
                tempAdditionParams.letterCaseArray = textElement.glyphCaseArray;
                tempAdditionParams.pickingData = textElement.userData ? textElement : undefined;
                textCanvas.addText(textElement.glyphs!, tempPosition, tempAdditionParams);
            }
        }
    }

    private getDistanceScalingFactor(label: TextElement, distance: number): number {
        // Distance scale is based on relation between camera focus point distance and
        // the actual label distance. For labels close to camera look at point the scale
        // remains unchanged, the farther is label from that point the smaller size it is
        // rendered in screen space. This method is unaffected by near and far clipping planes
        // distances, but may be improved by taking FOV into equation or customizing the
        // focus point screen position based on horizont, actual ground, tilt ets.
        let factor = this.m_mapView.lookAtDistance / distance;
        // The label.distanceScale property defines the influence ratio at which
        // distance affects the final scaling of label.
        factor = 1.0 + (factor - 1.0) * label.distanceScale;
        // Preserve the constraints
        factor = Math.max(factor, this.m_labelDistanceScaleMin!);
        factor = Math.min(factor, this.m_labelDistanceScaleMax!);
        return factor;
    }

    private getDistanceFadingFactor(label: TextElement, cameraFar: number): number {
        let distanceFadeValue = 1.0;
        const textDistance = label.currentViewDistance;

        if (textDistance !== undefined && label.fadeFar !== undefined && label.fadeFar > 0.0) {
            const fadeNear = label.fadeNear === undefined ? 0.0 : label.fadeNear;
            const fadeFar = label.fadeFar;
            if (fadeFar > fadeNear) {
                distanceFadeValue =
                    1.0 -
                    MathUtils.clamp(
                        (textDistance / cameraFar - fadeNear) / (fadeFar - fadeNear),
                        0.0,
                        1.0
                    );
            }
        }
        return distanceFadeValue;
    }

    private renderTextElements(
        textElements: TextElement[],
        time: number,
        frameNumber: number,
        zoomLevel: number,
        renderedTextElements?: TextElement[],
        secondChanceTextElements?: TextElement[]
    ): number {
        if (this.m_textRenderers.length === 0) {
            return 0;
        }

        const currentlyRenderingPlacedElements = renderedTextElements === undefined;

        const printInfo = textElements.length > 5000;
        let numNotVisible = 0;
        let numPathTooSmall = 0;
        let numCannotAdd = 0;
        let numRenderedPoiIcons = 0;
        let numRenderedPoiTexts = 0;
        let numPoiTextsInvisible = 0;

        const maxNumRenderedLabels = this.m_maxNumVisibleLabels!;
        const numSecondChanceLabels = this.m_numSecondChanceLabels!;
        let numRenderedTextElements = 0;

        const shieldGroups: number[][] = [];

        const textMaxDistance = this.getMaxDistance(this.m_maxDistanceRatioForTextLabels!);
        const poiTextMaxDistance = this.getMaxDistance(this.m_maxDistanceRatioForPoiLabels!);

        const cameraIsMoving = this.m_mapView.cameraIsMoving;
        const cameraFar = this.m_mapView.camera.far;

        // Keep track if we need to call another update() on MapView.
        let fadeAnimationRunning = false;

        const tempAdditionParams: AdditionParameters = {};
        const tempPoiMeasurementParams: MeasurementParameters = {};
        const tempMeasurementParams: MeasurementParameters = {};
        const tempBufferAdditionParams: TextBufferAdditionParameters = {};

        const tileGeometryManager = this.m_mapView.tileGeometryManager;
        const hiddenKinds =
            tileGeometryManager !== undefined ? tileGeometryManager.hiddenGeometryKinds : undefined;

        // Place text elements one by one.
        for (const textElement of textElements) {
            if (
                !currentlyRenderingPlacedElements &&
                maxNumRenderedLabels >= 0 &&
                numRenderedTextElements >= maxNumRenderedLabels
            ) {
                break;
            }

            // Get the TextElementStyle.
            const textElementStyle = this.getTextElementStyle(textElement.style);
            const textCanvas = textElementStyle.textCanvas;
            const poiRenderer = textElementStyle.poiRenderer;
            if (textCanvas === undefined || poiRenderer === undefined) {
                continue;
            }

            // Check if the label should be hidden.
            if (
                hiddenKinds !== undefined &&
                textElement.kind !== undefined &&
                hiddenKinds.hasOrIntersects(textElement.kind)
            ) {
                continue;
            }

            const isPathLabel = textElement.path !== undefined && !textElement.isLineMarker;
            let screenPoints: THREE.Vector2[];

            // For paths, check if the label may fit.
            if (isPathLabel) {
                const screenPointsResult = this.checkForSmallLabels(textElement);
                if (screenPointsResult === undefined) {
                    numNotVisible++;
                    if (textElement.dbgPathTooSmall === true) {
                        numPathTooSmall++;
                    }
                    continue;
                }
                screenPoints = screenPointsResult;
            }

            // Trigger the glyph load if needed.
            if (textElement.loadingState === undefined) {
                textElement.loadingState = LoadingState.Requested;

                if (textElement.renderStyle === undefined) {
                    textElement.renderStyle = new TextRenderStyle({
                        ...textElementStyle.renderParams,
                        ...textElement.renderParams
                    });
                }
                if (textElement.layoutStyle === undefined) {
                    textElement.layoutStyle = new TextLayoutStyle({
                        ...textElementStyle.layoutParams,
                        ...textElement.layoutParams
                    });
                }

                if (textElement.text === "") {
                    textElement.loadingState = LoadingState.Loaded;
                } else {
                    textCanvas.fontCatalog
                        .loadCharset(textElement.text, textElement.renderStyle)
                        .then(() => {
                            textElement.loadingState = LoadingState.Loaded;
                            this.m_mapView.update();
                        });
                }
            }
            if (textElement.loadingState === LoadingState.Loaded) {
                if (this.m_initializedTextElementCount < MAX_INITIALIZED_TEXT_ELEMENTS_PER_FRAME) {
                    textCanvas.textRenderStyle = textElement.renderStyle!;
                    textCanvas.textLayoutStyle = textElement.layoutStyle!;
                    textElement.glyphCaseArray = [];
                    textElement.glyphs = textCanvas.fontCatalog.getGlyphs(
                        textElement.text,
                        textCanvas.textRenderStyle,
                        textElement.glyphCaseArray
                    );
                    if (!isPathLabel) {
                        textElement.bounds = new THREE.Box2();
                        tempPoiMeasurementParams.letterCaseArray = textElement.glyphCaseArray!;
                        textCanvas.measureText(
                            textElement.glyphs!,
                            textElement.bounds,
                            tempPoiMeasurementParams
                        );
                    }
                    textElement.loadingState = LoadingState.Initialized;
                    ++this.m_initializedTextElementCount;
                }
            }
            if (textElement.loadingState !== LoadingState.Initialized) {
                if (
                    secondChanceTextElements !== undefined &&
                    secondChanceTextElements.length < numSecondChanceLabels
                ) {
                    secondChanceTextElements.push(textElement);
                }
                continue;
            }

            const layer = textCanvas.getLayer(textElement.renderOrder || DEFAULT_TEXT_CANVAS_LAYER);

            // Move onto the next TextElement if we cannot continue adding glyphs to this layer.
            if (layer !== undefined) {
                if (layer.storage.drawCount + textElement.glyphs!.length > layer.storage.capacity) {
                    ++numCannotAdd;
                    continue;
                }
            }

            // Set the current style for the canvas.
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;

            // Define the point, poi, lineMarker and path label placement functions.
            const addPointLabel = (
                pointLabel: TextElement,
                iconRenderState: RenderState,
                textRenderState: RenderState | undefined,
                position: THREE.Vector3,
                screenPosition: THREE.Vector2
            ): boolean => {
                // Find the label's original position.
                tempScreenPosition.x = tempPoiScreenPosition.x = screenPosition.x;
                tempScreenPosition.y = tempPoiScreenPosition.y = screenPosition.y;

                // Offset the label accordingly to alignment (and POI, if any).
                let xOffset =
                    (pointLabel.xOffset || 0.0) *
                    (pointLabel.layoutStyle!.horizontalAlignment === HorizontalAlignment.Right
                        ? -1.0
                        : 1.0);
                let yOffset =
                    (pointLabel.yOffset || 0.0) *
                    (pointLabel.layoutStyle!.verticalAlignment === VerticalAlignment.Below
                        ? -1.0
                        : 1.0);
                if (pointLabel.poiInfo !== undefined) {
                    xOffset +=
                        pointLabel.poiInfo.computedWidth! *
                        (0.5 + pointLabel.layoutStyle!.horizontalAlignment);
                    yOffset +=
                        pointLabel.poiInfo.computedHeight! *
                        (0.5 + pointLabel.layoutStyle!.verticalAlignment);
                }
                tempScreenPosition.x += xOffset;
                tempScreenPosition.y += yOffset;
                // If we try to place text above their current position, we need to compensate for
                // its bounding box height.
                if (pointLabel.layoutStyle!.verticalAlignment === VerticalAlignment.Above) {
                    tempScreenPosition.y += -pointLabel.bounds!.min.y;
                }

                // Scale the text depending on the label's distance to the camera.
                let textScale = 1.0;
                let distanceScaleFactor = 1.0;
                const textDistance = this.m_mapView.worldCenter.distanceTo(position);
                if (textDistance !== undefined) {
                    if (
                        pointLabel.fadeFar !== undefined &&
                        (pointLabel.fadeFar <= 0.0 || pointLabel.fadeFar * cameraFar < textDistance)
                    ) {
                        // The label is farther away than fadeFar value, which means it is totally
                        // transparent.
                        return false;
                    }
                    textElement.currentViewDistance = textDistance;

                    distanceScaleFactor = this.getDistanceScalingFactor(pointLabel, textDistance);
                    textScale *= distanceScaleFactor;
                }
                const distanceFadeFactor = this.getDistanceFadingFactor(pointLabel, cameraFar);

                // Check if there is need to check for screen space for the label's icon.
                const poiInfo = pointLabel.poiInfo;
                let iconSpaceAvailable = true;

                // Check if icon should be rendered at this zoomLevel
                const renderIcon =
                    poiInfo === undefined ||
                    MathUtils.isClamped(
                        zoomLevel,
                        poiInfo.iconMinZoomLevel,
                        poiInfo.iconMaxZoomLevel
                    );

                if (renderIcon && poiInfo !== undefined && poiRenderer.prepareRender(pointLabel)) {
                    if (poiInfo.isValid === false) {
                        return false;
                    }

                    const iconIsVisible = poiRenderer.computeScreenBox(
                        poiInfo,
                        tempPoiScreenPosition,
                        distanceScaleFactor,
                        this.m_screenCollisions,
                        tempBox2D
                    );

                    if (iconIsVisible) {
                        iconSpaceAvailable = poiRenderer.isSpaceAvailable(
                            this.m_screenCollisions,
                            tempBox2D
                        );

                        // Reserve screen space if necessary, return false if failed:
                        if (
                            // Check if free screen space is available:
                            !iconSpaceAvailable
                        ) {
                            if (!iconRenderState.isVisible()) {
                                return false;
                            } else if (
                                !(poiInfo.mayOverlap === true) &&
                                !iconRenderState.isFadingOut()
                            ) {
                                this.startFadeOut(iconRenderState, frameNumber, time);
                                if (textRenderState !== undefined && textRenderState.isVisible()) {
                                    this.startFadeOut(textRenderState, frameNumber, time);
                                }
                            }
                        } else {
                            if (
                                iconRenderState.lastFrameNumber < frameNumber - 1 ||
                                iconRenderState.isFadingOut() ||
                                iconRenderState.isFadedOut()
                            ) {
                                this.startFadeIn(iconRenderState, frameNumber, time);
                            }
                        }
                    }
                    // If the icon is prepared and valid, but just not visible, try again next time.
                    else {
                        if (
                            secondChanceTextElements !== undefined &&
                            secondChanceTextElements.length < numSecondChanceLabels
                        ) {
                            secondChanceTextElements.push(pointLabel);
                        }

                        // Forced making it un-current.
                        iconRenderState.lastFrameNumber = -1;

                        return false;
                    }
                    if (iconRenderState.isFading()) {
                        this.updateFading(iconRenderState, time);
                    }
                }

                // Check if label should be rendered at this zoomLevel
                const renderText =
                    poiInfo === undefined ||
                    zoomLevel === undefined ||
                    MathUtils.isClamped(
                        zoomLevel,
                        poiInfo.iconMinZoomLevel,
                        poiInfo.iconMaxZoomLevel
                    );

                // Check if we should render the label's text.
                const doRenderText =
                    // Render if between min/max zoom level
                    renderText &&
                    // Do not render if the distance is too great and distance shouldn't be ignored.
                    (pointLabel.ignoreDistance === true ||
                        (pointLabel.currentViewDistance === undefined ||
                            pointLabel.currentViewDistance < poiTextMaxDistance)) &&
                    // Do not render text if POI cannot be rendered and is not optional.
                    (poiInfo === undefined ||
                        poiInfo.isValid === true ||
                        poiInfo.iconIsOptional !== false);

                // Render the label's text...
                if (doRenderText && textElement.text !== "") {
                    // Adjust the label positioning to match its bounding box.
                    tempPosition.x = tempScreenPosition.x;
                    tempPosition.y = tempScreenPosition.y;
                    tempPosition.z = textElement.renderDistance;

                    tempBox2D.x = tempScreenPosition.x + pointLabel.bounds!.min.x * textScale;
                    tempBox2D.y = tempScreenPosition.y + pointLabel.bounds!.min.y * textScale;
                    tempBox2D.w = (pointLabel.bounds!.max.x - pointLabel.bounds!.min.x) * textScale;
                    tempBox2D.h = (pointLabel.bounds!.max.y - pointLabel.bounds!.min.y) * textScale;

                    // TODO: Make the margin configurable
                    tempBox2D.x -= 4 * textScale;
                    tempBox2D.y -= 2 * textScale;
                    tempBox2D.w += 8 * textScale;
                    tempBox2D.h += 4 * textScale;

                    // Check the text visibility.
                    if (!this.m_screenCollisions.isVisible(tempBox2D)) {
                        if (
                            secondChanceTextElements !== undefined &&
                            secondChanceTextElements.length < numSecondChanceLabels
                        ) {
                            secondChanceTextElements.push(pointLabel);
                        }
                        numPoiTextsInvisible++;
                        return false;
                    }

                    const textIsOptional: boolean =
                        pointLabel.poiInfo !== undefined &&
                        pointLabel.poiInfo.textIsOptional === true;

                    const textIsFadingIn =
                        textRenderState !== undefined && textRenderState.isFadingIn();
                    const textIsFadingOut =
                        textRenderState !== undefined && textRenderState.isFadingOut();
                    const textSpaceAvailable = !this.m_screenCollisions.isAllocated(tempBox2D);
                    const textVisible =
                        pointLabel.textMayOverlap ||
                        textSpaceAvailable ||
                        textIsFadingIn ||
                        textIsFadingOut;

                    if (textVisible) {
                        // Compute the TextBufferObject when we know we're gonna render this label.
                        if (pointLabel.textBufferObject === undefined) {
                            pointLabel.textBufferObject = textCanvas.createTextBufferObject(
                                pointLabel.glyphs!
                            );
                        }

                        // Allocate collision info if needed.
                        if (!textIsFadingOut && pointLabel.textReservesSpace) {
                            this.m_screenCollisions.allocate(tempBox2D);
                        }

                        // Do not actually render (just allocate space) if camera is moving and
                        // renderTextDuringMovements is not true.
                        if (
                            (textIsFadingIn ||
                                textIsFadingOut ||
                                !cameraIsMoving ||
                                (poiInfo === undefined ||
                                    poiInfo.renderTextDuringMovements === true)) &&
                            !iconRenderState.isFadedOut()
                        ) {
                            let textFading = false;
                            if (
                                !iconRenderState.isFadingOut() &&
                                textSpaceAvailable &&
                                iconSpaceAvailable
                            ) {
                                textFading = this.checkStartFadeIn(
                                    textRenderState,
                                    frameNumber,
                                    time,
                                    true
                                );
                            } else if (textRenderState !== undefined) {
                                if (textRenderState.isFading()) {
                                    this.updateFading(textRenderState, time);
                                    textFading = true;
                                }
                            }
                            fadeAnimationRunning =
                                fadeAnimationRunning || textIsFadingOut || textFading;

                            const opacity =
                                textRenderState !== undefined
                                    ? textRenderState.opacity
                                    : iconRenderState.opacity;

                            tempBufferAdditionParams.layer = pointLabel.renderOrder;
                            tempBufferAdditionParams.position = tempPosition;
                            tempBufferAdditionParams.scale = textScale;
                            tempBufferAdditionParams.opacity =
                                opacity * distanceFadeFactor * textElement.renderStyle!.opacity;
                            tempBufferAdditionParams.backgroundOpacity =
                                tempBufferAdditionParams.opacity *
                                textElement.renderStyle!.backgroundOpacity;
                            tempBufferAdditionParams.pickingData = textElement.userData
                                ? textElement
                                : undefined;
                            textCanvas.addTextBufferObject(
                                pointLabel.textBufferObject!,
                                tempBufferAdditionParams
                            );
                        }
                        numRenderedPoiTexts++;
                    }

                    // If the text is not visible nor optional, we won't render the icon neither.
                    else if (!renderIcon || !textIsOptional) {
                        if (pointLabel.poiInfo === undefined || iconRenderState.isVisible()) {
                            if (pointLabel.poiInfo !== undefined) {
                                this.startFadeOut(iconRenderState, frameNumber, time);
                            }
                            if (textRenderState !== undefined && textRenderState.isVisible()) {
                                const iconStartedFadeOut = this.checkStartFadeOut(
                                    textRenderState,
                                    frameNumber,
                                    time
                                );
                                fadeAnimationRunning = fadeAnimationRunning || iconStartedFadeOut;
                            }
                            this.startFadeOut(iconRenderState, frameNumber, time);
                        } else {
                            if (
                                secondChanceTextElements !== undefined &&
                                secondChanceTextElements.length < numSecondChanceLabels
                            ) {
                                secondChanceTextElements.push(pointLabel);
                            }
                            numPoiTextsInvisible++;
                            return false;
                        }
                    }
                    // If the label is currently visible, fade it out.
                    else if (textRenderState !== undefined && textRenderState.isVisible()) {
                        const iconStartedFadeOut = this.checkStartFadeOut(
                            textRenderState,
                            frameNumber,
                            time
                        );
                        fadeAnimationRunning = fadeAnimationRunning || iconStartedFadeOut;
                    }
                }
                // ... and render the icon (if any).
                if (renderIcon && poiInfo !== undefined && poiRenderer.poiIsRenderable(poiInfo)) {
                    const iconStartedFadeIn = this.checkStartFadeIn(
                        iconRenderState,
                        frameNumber,
                        time
                    );
                    fadeAnimationRunning = fadeAnimationRunning || iconStartedFadeIn;

                    poiRenderer.renderPoi(
                        poiInfo,
                        tempPoiScreenPosition,
                        this.m_screenCollisions,
                        distanceScaleFactor,
                        poiInfo.reserveSpace !== false,
                        iconRenderState.opacity * distanceFadeFactor
                    );

                    iconRenderState.lastFrameNumber = frameNumber;

                    numRenderedPoiIcons++;
                }

                // Add this label to the list of rendered elements.
                if (renderedTextElements !== undefined) {
                    renderedTextElements.push(pointLabel);
                }
                numRenderedTextElements++;
                return true;
            };

            const addPoiLabel = (poiLabel: TextElement): void => {
                // Calculate the world position of this label.
                tempPosition.copy(poiLabel.position).add(poiLabel.tileCenter!);

                // Only process labels frustum-clipped labels
                if (
                    this.m_screenProjector.project(tempPosition, tempScreenPosition) !== undefined
                ) {
                    // Initialize the POI's icon and text render states (fading).
                    if (poiLabel.iconRenderState === undefined) {
                        poiLabel.iconRenderState = new RenderState();
                        poiLabel.textRenderState = new RenderState();

                        if (this.m_mapView.disableFading) {
                            // Force fadingTime to zero to keep it from fading in and out.
                            poiLabel.iconRenderState.fadingTime = 0;
                            poiLabel.textRenderState.fadingTime = 0;
                        }
                    }

                    // Add this POI as a point label.
                    addPointLabel(
                        poiLabel,
                        poiLabel.iconRenderState,
                        poiLabel.textRenderState,
                        tempPosition,
                        tempScreenPosition
                    );
                }
            };

            const addLineMarkerLabel = (lineMarkerLabel: TextElement): void => {
                // Early exit if the line marker doesn't have the necessary data.
                const poiInfo = lineMarkerLabel.poiInfo!;
                if (
                    lineMarkerLabel.path === undefined ||
                    lineMarkerLabel.path.length === 0 ||
                    !poiRenderer.prepareRender(lineMarkerLabel)
                ) {
                    return;
                }

                // Initialize the shield group for this lineMarker.
                let shieldGroup: number[] | undefined;
                if (poiInfo.shieldGroupIndex !== undefined) {
                    shieldGroup = shieldGroups[poiInfo.shieldGroupIndex];
                    if (shieldGroup === undefined) {
                        shieldGroup = [];
                        shieldGroups[poiInfo.shieldGroupIndex] = shieldGroup;
                    }
                }

                // Create an individual render state for every individual point of the lineMarker.
                if (lineMarkerLabel.iconRenderStates === undefined) {
                    const renderStates = new Array<RenderState>();
                    lineMarkerLabel.path.forEach(() => {
                        const renderState = new RenderState();
                        renderState.state = FadingState.FadingIn;
                        renderState.fadingTime = this.m_mapView.disableFading
                            ? 0
                            : renderState.fadingTime;
                        renderStates.push(renderState);
                    });
                    lineMarkerLabel.iconRenderStates = renderStates;
                }

                const lineTechnique = poiInfo.technique as LineMarkerTechnique;
                const minDistanceSqr =
                    lineTechnique.minDistance !== undefined
                        ? lineTechnique.minDistance * lineTechnique.minDistance
                        : 0;

                // Process markers (with shield groups).
                if (minDistanceSqr > 0 && shieldGroup !== undefined) {
                    for (let i = 0; i < lineMarkerLabel.path.length; i++) {
                        const point = lineMarkerLabel.path[i];
                        // Calculate the world position of this label.
                        tempPosition.copy(point).add(lineMarkerLabel.tileCenter!);

                        // Only process labels frustum-clipped labels
                        if (
                            this.m_screenProjector.project(tempPosition, tempScreenPosition) !==
                            undefined
                        ) {
                            // Find a suitable location for the lineMarker to be placed at.
                            let tooClose = false;
                            for (let j = 0; j < shieldGroup.length; j += 2) {
                                const distanceSqr = Math2D.distSquared(
                                    shieldGroup[j],
                                    shieldGroup[j + 1],
                                    tempScreenPosition.x,
                                    tempScreenPosition.y
                                );
                                tooClose = distanceSqr < minDistanceSqr;
                                if (tooClose) {
                                    break;
                                }
                            }

                            // Place it as a point label if it's not to close to other marker in the
                            // same shield group.
                            if (!tooClose) {
                                if (
                                    addPointLabel(
                                        lineMarkerLabel,
                                        lineMarkerLabel.iconRenderStates![i],
                                        undefined,
                                        tempPosition,
                                        tempScreenPosition
                                    )
                                ) {
                                    shieldGroup.push(tempScreenPosition.x, tempScreenPosition.y);
                                }
                            }
                        }
                    }
                }
                // Process markers (without shield groups).
                else {
                    for (let i = 0; i < lineMarkerLabel.path.length; i++) {
                        const point = lineMarkerLabel.path[i];

                        // Calculate the world position of this label.
                        tempPosition.copy(point).add(lineMarkerLabel.tileCenter!);

                        // Only process labels frustum-clipped labels
                        if (
                            this.m_screenProjector.project(tempPosition, tempScreenPosition) !==
                            undefined
                        ) {
                            addPointLabel(
                                lineMarkerLabel,
                                lineMarkerLabel.iconRenderStates![i],
                                undefined,
                                tempPosition,
                                tempScreenPosition
                            );
                        }
                    }
                }
            };

            const addPathLabel = (pathLabel: TextElement): boolean => {
                // Limit the text rendering of path labels in the far distance.
                if (
                    !(
                        pathLabel.ignoreDistance === true ||
                        pathLabel.currentViewDistance === undefined ||
                        pathLabel.currentViewDistance < textMaxDistance
                    )
                ) {
                    return false;
                }

                if (
                    pathLabel.fadeFar !== undefined &&
                    (pathLabel.fadeFar <= 0.0 ||
                        pathLabel.fadeFar * cameraFar < pathLabel.renderDistance)
                ) {
                    // The label is farther away than fadeFar value, which means it is totally
                    // transparent
                    return false;
                }

                // Compute values common for all glyphs in the label.
                let textScale = textCanvas.textRenderStyle.fontSize.size / 100.0;
                let opacity = textElement.renderStyle!.opacity;

                // Get the screen points that define the label's segments and create a path with
                // them.
                let textPath = new THREE.Path();
                tempScreenPosition.copy(screenPoints[0]);
                for (let i = 0; i < screenPoints.length - 1; ++i) {
                    textPath.add(new SimpleLineCurve(screenPoints[i], screenPoints[i + 1]));
                }
                // Flip the path if the label is gonna be rendered downwards.
                if (textPath.getPoint(0.5).x - textPath.getPoint(0.51).x > 0) {
                    tempScreenPosition.copy(screenPoints[screenPoints.length - 1]);
                    textPath = new THREE.Path();
                    for (let i = screenPoints.length - 1; i > 0; --i) {
                        textPath.add(new SimpleLineCurve(screenPoints[i], screenPoints[i - 1]));
                    }
                }

                // Update the real rendering distance to have smooth fading and scaling
                this.updateViewDistance(this.m_mapView.worldCenter, pathLabel);
                const textRenderDistance = -pathLabel.renderDistance;

                // Scale the text depending on the label's distance to the camera.
                const distanceScaleFactor = this.getDistanceScalingFactor(
                    pathLabel,
                    textRenderDistance
                );
                textScale *= distanceScaleFactor;

                // Scale the path label correctly.
                const prevSize = textCanvas.textRenderStyle.fontSize.size;
                textCanvas.textRenderStyle.fontSize.size = textScale * 100;

                // Recalculate the text bounds for this path label. If measurement fails, the whole
                // label doesn't fit the path and should be discarded.
                tempMeasurementParams.path = textPath;
                tempMeasurementParams.outputCharacterBounds = tempBoxes;
                tempMeasurementParams.letterCaseArray = pathLabel.glyphCaseArray!;
                if (!textCanvas.measureText(pathLabel.glyphs!, tempBox, tempMeasurementParams)) {
                    textCanvas.textRenderStyle.fontSize.size = prevSize;
                    return false;
                }

                // Perform per-character collision checks.
                for (const charBounds of tempBoxes) {
                    tempBox2D.x = tempScreenPosition.x + charBounds.min.x;
                    tempBox2D.y = tempScreenPosition.y + charBounds.min.y;
                    tempBox2D.w = charBounds.max.x - charBounds.min.x;
                    tempBox2D.h = charBounds.max.y - charBounds.min.y;
                    if (
                        !this.m_screenCollisions.isVisible(tempBox2D) ||
                        (!textElement.textMayOverlap &&
                            this.m_screenCollisions.isAllocated(tempBox2D))
                    ) {
                        textCanvas.textRenderStyle.fontSize.size = prevSize;
                        return false;
                    }
                }

                // Fade-in after skipping rendering during movement.
                // NOTE: Shouldn't this only happen once we know the label is gonna be visible?
                if (pathLabel.textRenderState === undefined) {
                    pathLabel.textRenderState = new RenderState();
                    pathLabel.textRenderState.fadingTime = this.m_mapView.disableFading
                        ? 0
                        : pathLabel.textRenderState.fadingTime;
                }
                if (
                    pathLabel.textRenderState.state === FadingState.Undefined ||
                    pathLabel.textRenderState.lastFrameNumber < frameNumber - 1
                ) {
                    this.startFadeIn(pathLabel.textRenderState, frameNumber, time);
                }
                const startedFadeIn = this.checkStartFadeIn(
                    pathLabel.textRenderState,
                    frameNumber,
                    time
                );
                fadeAnimationRunning = fadeAnimationRunning || startedFadeIn;
                if (pathLabel.textRenderState.isFading()) {
                    opacity = pathLabel.textRenderState.opacity * textElement.renderStyle!.opacity;
                }

                const prevOpacity = textCanvas.textRenderStyle.opacity;
                const prevBgOpacity = textCanvas.textRenderStyle.backgroundOpacity;
                const distanceFadeFactor = this.getDistanceFadingFactor(pathLabel, cameraFar);
                textCanvas.textRenderStyle.opacity = opacity * distanceFadeFactor;
                textCanvas.textRenderStyle.backgroundOpacity =
                    textCanvas.textRenderStyle.opacity * textElement.renderStyle!.backgroundOpacity;

                tempPosition.z = textElement.renderDistance;

                tempAdditionParams.path = textPath;
                tempAdditionParams.layer = pathLabel.renderOrder;
                tempAdditionParams.letterCaseArray = pathLabel.glyphCaseArray;
                tempAdditionParams.pickingData = textElement.userData ? textElement : undefined;
                textCanvas.addText(pathLabel.glyphs!, tempPosition, tempAdditionParams);

                // Allocate collision info if needed.
                if (pathLabel.textReservesSpace) {
                    tempBox2D.x = tempScreenPosition.x + tempBox.min.x;
                    tempBox2D.y = tempScreenPosition.y + tempBox.min.y;
                    tempBox2D.w = tempBox.max.x - tempBox.min.x;
                    tempBox2D.h = tempBox.max.y - tempBox.min.y;
                    this.m_screenCollisions.allocate(tempBox2D);
                }

                // Add this label to the list of rendered elements.
                if (renderedTextElements !== undefined) {
                    renderedTextElements.push(pathLabel);
                }
                numRenderedTextElements++;

                // Restore previous style values for text elements using the same style.
                textCanvas.textRenderStyle.fontSize.size = prevSize;
                textCanvas.textRenderStyle.opacity = prevOpacity;
                textCanvas.textRenderStyle.backgroundOpacity = prevBgOpacity;
                return true;
            };

            // Render a POI...
            if (textElement.path === undefined) {
                addPoiLabel(textElement);
            }
            // ... a line marker...
            else if (textElement.isLineMarker) {
                addLineMarkerLabel(textElement);
            }
            // ... or a path label.
            else {
                addPathLabel(textElement);
            }
        }

        if (PRINT_LABEL_DEBUG_INFO && printInfo) {
            logger.log("textElements.length", textElements.length);
            logger.log("numRenderedTextElements", numRenderedTextElements);
            logger.log("numRenderedPoiIcons", numRenderedPoiIcons);
            logger.log("numRenderedPoiTexts", numRenderedPoiTexts);
            logger.log("numPoiTextsInvisible", numPoiTextsInvisible);
            logger.log("numNotVisible", numNotVisible);
            logger.log("numPathTooSmall", numPathTooSmall);
            logger.log("numCannotAdd", numCannotAdd);
        }

        if (!this.m_mapView.disableFading && fadeAnimationRunning) {
            this.m_mapView.update();
        }

        return numRenderedTextElements;
    }

    private checkForSmallLabels(textElement: TextElement): THREE.Vector2[] | undefined {
        let indexOfFirstVisibleScreenPoint = -1;
        // Get the screen points that define the label's segments and create a path with
        // them.
        const screenPoints: THREE.Vector2[] = [];
        let minX = Number.MAX_SAFE_INTEGER;
        let maxX = Number.MIN_SAFE_INTEGER;
        let minY = Number.MAX_SAFE_INTEGER;
        let maxY = Number.MIN_SAFE_INTEGER;
        for (const pt of textElement.path!) {
            tempPosition.copy(pt).add(textElement.tileCenter!);
            const screenPoint = this.m_screenProjector.project(tempPosition, tempScreenPosition);
            if (screenPoint === undefined) {
                continue;
            }
            screenPoints.push(tempScreenPosition.clone());

            if (screenPoint.x < minX) {
                minX = screenPoint.x;
            }
            if (screenPoint.x > maxX) {
                maxX = screenPoint.x;
            }
            if (screenPoint.y < minY) {
                minY = screenPoint.y;
            }
            if (screenPoint.y > maxY) {
                maxY = screenPoint.y;
            }

            if (indexOfFirstVisibleScreenPoint < 0) {
                const firstIndex = screenPoints.findIndex(p2 => {
                    return this.m_screenCollisions.screenBounds.contains(p2.x, p2.y);
                });

                if (firstIndex >= 0) {
                    indexOfFirstVisibleScreenPoint = firstIndex;
                }
            }
        }

        // TODO: (HARP-3515)
        //      The rendering of a path label that contains just a single point that is not
        //      visible is impossible, which is problematic with long paths.
        //      Fix: Skip/clip the invisible points at beginning and end of the path to get
        //      the visible part of the path.

        // If not a single point is visible, skip the path
        if (indexOfFirstVisibleScreenPoint === -1) {
            return undefined;
        }

        // Check/guess if the screen box can hold a string of that length. It is important
        // to guess that value without measuring the font first to save time.
        const minScreenSpace = textElement.text.length * MIN_AVERAGE_CHAR_WIDTH;
        if (
            (maxX - minX) * (maxX - minX) + (maxY - minY) * (maxY - minY) <
            minScreenSpace * minScreenSpace
        ) {
            textElement.dbgPathTooSmall = true;
            return undefined;
        }

        return screenPoints;
    }

    private renderTileList(
        visibleTiles: Tile[],
        time: number,
        frameNumber: number,
        zoomLevel: number,
        renderStartTime: number | undefined,
        renderedTextElements?: TextElement[],
        secondChanceTextElements?: TextElement[]
    ) {
        if (this.m_textRenderers.length === 0 || visibleTiles.length === 0) {
            return;
        }

        const consideredTextElements = new GroupedPriorityList<TextElement>();

        for (const tile of visibleTiles) {
            consideredTextElements.merge(tile.placedTextElements);
        }

        const maxNumRenderedTextElements = this.m_maxNumVisibleLabels!;
        let numRenderedTextElements = 0;

        for (const elementGroup of consideredTextElements.sortedGroups) {
            const textElementsInGroup = elementGroup.elements;

            this.sortTextElements(textElementsInGroup, this.m_mapView.camera.far);

            numRenderedTextElements += this.renderTextElements(
                textElementsInGroup,
                time,
                frameNumber,
                zoomLevel,
                renderedTextElements,
                secondChanceTextElements
            );

            if (numRenderedTextElements > maxNumRenderedTextElements) {
                break;
            }

            // renderStartTime is set if this.overloaded is true
            if (renderStartTime !== undefined && OVERLOAD_RENDER_TIME_LIMIT > 0) {
                const endTime = PerformanceTimer.now();
                const elapsedTime = endTime - renderStartTime;
                if (elapsedTime > OVERLOAD_RENDER_TIME_LIMIT) {
                    return;
                }
            }
        }
    }

    private checkIfOverloaded(): boolean {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;

        // Count the number of TextElements in the scene to see if we have to switch to
        // "overloadMode".
        let numTextElementsInScene = 0;

        renderList.forEach(renderListEntry => {
            for (const tile of renderListEntry.renderedTiles) {
                numTextElementsInScene += tile.textElementGroups.count();
                numTextElementsInScene += tile.userTextElements.length;
            }
        });
        this.m_overloaded = numTextElementsInScene > OVERLOAD_LABEL_LIMIT;

        return this.m_overloaded;
    }

    private checkStartFadeIn(
        renderState: RenderState | undefined,
        frameNumber: number,
        time: number,
        forceFadeIn = false
    ): boolean {
        let fadeAnimationStarted = false;

        if (renderState !== undefined) {
            // Fade-in after skipping rendering during movement
            if (
                forceFadeIn ||
                renderState.state === FadingState.Undefined ||
                renderState.lastFrameNumber < frameNumber - 1
            ) {
                this.startFadeIn(renderState, frameNumber, time);
            }

            if (renderState.isFading()) {
                this.updateFading(renderState, time);
                fadeAnimationStarted = true;
            }

            renderState.lastFrameNumber = frameNumber;
        }
        return fadeAnimationStarted;
    }

    private checkStartFadeOut(
        renderState: RenderState | undefined,
        frameNumber: number,
        time: number,
        forceFadeOut = true
    ): boolean {
        let fadeAnimationStarted = false;

        if (renderState !== undefined) {
            // Fade-in after skipping rendering during movement
            if (
                forceFadeOut ||
                renderState.state === FadingState.Undefined ||
                renderState.lastFrameNumber < frameNumber - 1
            ) {
                this.startFadeOut(renderState, frameNumber, time);
            }

            if (renderState.isFading()) {
                this.updateFading(renderState, time);
                fadeAnimationStarted = true;
            }

            renderState.lastFrameNumber = frameNumber;
        }
        return fadeAnimationStarted;
    }

    private startFadeIn(renderState: RenderState, frameNumber: number, time: number) {
        if (renderState.lastFrameNumber < frameNumber - 1) {
            renderState.reset();
        }

        if (
            renderState.state === FadingState.FadingIn ||
            renderState.state === FadingState.FadedIn
        ) {
            return;
        }

        if (renderState.state === FadingState.FadingOut) {
            // The fadeout is not complete: compute the virtual fadingStartTime in the past, to get
            // a correct end time:
            renderState.value = 1.0 - renderState.value;
            renderState.startTime = time - renderState.value * renderState.fadingTime;
        } else {
            renderState.startTime = time;
            renderState.value = 0.0;
            renderState.opacity = 0;
        }

        renderState.state = FadingState.FadingIn;
    }

    private startFadeOut(renderState: RenderState, frameNumber: number, time: number) {
        if (renderState.lastFrameNumber < frameNumber - 1) {
            renderState.reset();
        }

        if (
            renderState.state === FadingState.FadingOut ||
            renderState.state === FadingState.FadedOut
        ) {
            return;
        }

        if (renderState.state === FadingState.FadingIn) {
            // The fade-in is not complete: compute the virtual fadingStartTime in the past, to get
            // a correct end time:
            renderState.startTime = time - renderState.value * renderState.fadingTime;
            renderState.value = 1.0 - renderState.value;
        } else {
            renderState.startTime = time;
            renderState.value = 0.0;
            renderState.opacity = 1;
        }

        renderState.state = FadingState.FadingOut;
    }

    private updateFading(renderState: RenderState, time: number) {
        if (
            renderState.state !== FadingState.FadingIn &&
            renderState.state !== FadingState.FadingOut
        ) {
            return;
        }

        if (renderState.startTime === 0) {
            renderState.startTime = time;
        }

        const fadingTime = time - renderState.startTime;
        const startValue = renderState.state === FadingState.FadingIn ? 0 : 1;
        const endValue = renderState.state === FadingState.FadingIn ? 1 : 0;

        if (fadingTime >= renderState.fadingTime) {
            renderState.value = 1.0;
            renderState.opacity = endValue;
            renderState.state =
                renderState.state === FadingState.FadingIn
                    ? FadingState.FadedIn
                    : FadingState.FadedOut;
        } else {
            renderState.value = fadingTime / renderState.fadingTime;

            renderState.opacity = MathUtils.clamp(
                MathUtils.smootherStep(startValue, endValue, renderState.value),
                0,
                1
            );
        }
    }
}
