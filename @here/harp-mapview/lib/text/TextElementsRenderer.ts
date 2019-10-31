/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LineMarkerTechnique, TextStyleDefinition, Theme } from "@here/harp-datasource-protocol";
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
    assert,
    getOptionValue,
    LoggerManager,
    LogLevel,
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
import { IBox, LineWithBound, ScreenCollisions } from "../ScreenCollisions";
import { ScreenProjector } from "../ScreenProjector";
import { Tile } from "../Tile";
import { MapViewUtils } from "../Utils";
import { checkReadyForPlacement, computeViewDistance, getMaxViewDistance } from "./Placement";
import { PlacementStats } from "./PlacementStats";
import { FadingState, RenderState } from "./RenderState";
import { SimpleLineCurve, SimplePath } from "./SimplePath";
import { LoadingState, TextElement, TextPickResult } from "./TextElement";
import { TextElementGroup } from "./TextElementGroup";
import { TextElementFilter, TextElementGroupState } from "./TextElementGroupState";
import { TextElementState } from "./TextElementState";
import { TextElementStateCache } from "./TextElementStateCache";
import { DEFAULT_TEXT_STYLE_CACHE_ID } from "./TextStyleCache";
import { UpdateStats } from "./UpdateStats";

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

interface MapViewState {
    cameraIsMoving: boolean;
    maxVisibilityDist: number;
    zoomLevel: number;
    frameNumber: number;
    time: number;
    numRenderedTextElements: number;
    // TODO: HARP-7373. Move to update() method at the end of the frame.
    fadeAnimationRunning: boolean;
}
interface TempParams {
    additionParams: AdditionParameters;
    poiMeasurementParams: MeasurementParameters;
    measurementParams: MeasurementParameters;
    bufferAdditionParams: TextBufferAdditionParameters;
}

enum Pass {
    PersistentLabels,
    NewLabels
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
 * Default number of labels/POIs updated in a frame. They are rendered only if they fit. If the
 * camera is not moving, it is ignored. See [[TextElementsRenderer.isDynamicFrame]].
 */
const OVERLOAD_UPDATED_LABEL_LIMIT = 100;

/**
 * If "overloaded" is `true`:
 *
 * Maximum time in milliseconds available for placement. If value is <= 0, or if the camera is not
 * moving, it is ignored. See [[TextElementsRenderer.isDynamicFrame]].
 */
const OVERLOAD_UPDATE_TIME_LIMIT = 5;

/**
 * If "overloaded" is `true`:
 *
 * Maximum time in milliseconds available for rendering. If value is <= 0, or if the camera is not
 * moving, it is ignored. See [[TextElementsRenderer.isDynamicFrame]].
 */
const OVERLOAD_PLACE_TIME_LIMIT = 10;

/**
 * Minimum number of pixels per character. Used during estimation if there is enough screen space
 * available to render a text.
 */
const MIN_AVERAGE_CHAR_WIDTH = 5;

const logger = LoggerManager.instance.create("TextElementsRenderer", { level: LogLevel.Log });

// Development flag: Enable debug print.
const PRINT_LABEL_DEBUG_INFO: boolean = false;
const updateStats = PRINT_LABEL_DEBUG_INFO ? new UpdateStats(logger) : undefined;
const placementStats = PRINT_LABEL_DEBUG_INFO ? new PlacementStats(logger) : undefined;

const tempBox = new THREE.Box2();
const tempBoxes: THREE.Box2[] = [];
const tempBox2D = new Math2D.Box();

const tempPosition = new THREE.Vector3();
const tempScreenPosition = new THREE.Vector2();
const tempPoiScreenPosition = new THREE.Vector2();

class TileTextElements {
    constructor(readonly tile: Tile, readonly group: TextElementGroup) {}
}

class TextElementLists {
    constructor(readonly lists: TileTextElements[]) {}

    get priority() {
        assert(this.lists.length > 0);
        // All text element lists here have the same priority.
        return this.lists[0].group.priority;
    }
    /**
     * Sum up the number of elements in all lists.
     */
    count(): number {
        let n = 0;
        for (const list of this.lists) {
            n += list.group.elements.length;
        }
        return n;
    }
}

function isPlacementTimeExceeded(startTime: number | undefined): boolean {
    // startTime is set in overload mode.
    if (startTime === undefined || OVERLOAD_PLACE_TIME_LIMIT <= 0) {
        return false;
    }
    const endTime = PerformanceTimer.now();
    const elapsedTime = endTime - startTime;
    if (elapsedTime > OVERLOAD_PLACE_TIME_LIMIT) {
        logger.debug("Placement time limit exceeded.");
        return true;
    }
    return false;
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

    private m_overlayTextElements?: TextElement[];

    // TODO: Replace this for an array of textures when more fonts are in use.
    private m_debugGlyphTextureCacheMesh?: THREE.Mesh;
    private m_debugGlyphTextureCacheWireMesh?: THREE.LineSegments;

    private m_tmpVector = new THREE.Vector2();
    private m_overloaded: boolean = false;
    private m_cacheInvalidated: boolean = false;
    private m_catalogsLoading: number = 0;

    private m_textElementStateCache: TextElementStateCache = new TextElementStateCache();

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
        // TODO: HARP-7648. Unused so far. Use it to limit the number of new labels that are tested
        // for rendering on frames with no new label splacement.
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
     * Update state at the end of a frame.
     */
    updateTextRenderers() {
        for (const textRenderer of this.m_textRenderers) {
            textRenderer.poiRenderer.update();
        }
    }

    /**
     * Forces update of text elements in the next call to [[placeText]].
     */
    invalidateCache() {
        this.m_cacheInvalidated = true;
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
        this.invalidateCache();
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
     * Places text elements for the current frame.
     * @param tileTextElementsChanged Indicates whether there's been any change in the text elements
     * to place since the last call to this method (last frame).
     * @param time Current frame time.
     * @param frameNumber Current frame number.
     */
    placeText(tileTextElementsChanged: boolean, time: number, frameNumber: number) {
        const updateTextElements = this.m_cacheInvalidated || tileTextElementsChanged;

        logger.debug(
            `FRAME: ${this.m_mapView.frameNumber}, ZOOM LEVEL: ${this.m_mapView.zoomLevel}`
        );

        const clearVisitedGroups = updateTextElements;
        this.m_textElementStateCache.update(time, clearVisitedGroups, this.m_mapView.disableFading);

        if (updateTextElements) {
            this.updateTextElements();
        }

        this.reset();
        this.prepopulateScreenWithBlockingElements();
        this.placeTextElements(time, frameNumber);
        this.placeOverlay();
        this.updateTextRenderers();
    }

    /**
     * Adds new overlay text elements to this `MapView`.
     *
     * @param textElements Array of [[TextElement]] to be added.
     */
    addOverlayText(textElements: TextElement[]): void {
        if (textElements.length === 0) {
            return;
        }
        this.m_overlayTextElements =
            this.m_overlayTextElements === undefined
                ? textElements.slice()
                : this.m_overlayTextElements.concat(textElements);
    }

    /**
     * Adds new overlay text elements to this `MapView`.
     *
     * @param textElements Array of [[TextElement]] to be added.
     */
    clearOverlayText(): void {
        this.m_overlayTextElements = [];
    }

    /**
     * @returns Whether there's overlay text to be rendered.
     */
    hasOverlayText(): boolean {
        return this.m_overlayTextElements !== undefined && this.m_overlayTextElements.length > 0;
    }

    get overlayText(): TextElement[] | undefined {
        return this.m_overlayTextElements;
    }

    /**
     * Place the [[TextElement]]s that are not part of the scene, but the overlay. Useful if a UI
     * with text or just plain information in the canvas itself should be presented to the user,
     * instead of using an HTML layer.
     *
     */
    placeOverlay() {
        if (this.m_overlayTextElements === undefined || this.m_overlayTextElements.length === 0) {
            return;
        }

        this.placeOverlayTextElements();
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
        this.m_textElementStateCache.clear();
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

    /**
     * Fills the screen with lines projected from world space, see [[Tile.blockingElements]].
     * @note These boxes have highest priority, so will block all other labels.
     */
    prepopulateScreenWithBlockingElements() {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;
        const boxes: IBox[] = [];
        renderList.forEach(renderListEntry => {
            const startLinePointProj = new THREE.Vector3();
            const endLinePointProj = new THREE.Vector3();
            for (const tile of renderListEntry.visibleTiles) {
                for (const pathBlockingElement of tile.blockingElements) {
                    if (pathBlockingElement.points.length < 2) {
                        continue;
                    }
                    this.m_screenProjector.project3(
                        pathBlockingElement.points[0],
                        startLinePointProj
                    );
                    for (let i = 1; i < pathBlockingElement.points.length; i++) {
                        this.m_screenProjector.project3(
                            pathBlockingElement.points[i],
                            endLinePointProj
                        );
                        const line = pathBlockingElement.screenSpaceLines[i - 1];
                        line.start.copy(startLinePointProj);
                        line.end.copy(endLinePointProj);
                        const lineWithBound: LineWithBound = {
                            minX: Math.min(startLinePointProj.x, endLinePointProj.x),
                            maxX: Math.max(startLinePointProj.x, endLinePointProj.x),
                            minY: Math.min(startLinePointProj.y, endLinePointProj.y),
                            maxY: Math.max(startLinePointProj.y, endLinePointProj.y),
                            type: "line",
                            line
                        };
                        boxes.push(lineWithBound);
                        startLinePointProj.copy(endLinePointProj);
                    }
                }
            }
        });
        this.m_screenCollisions.allocateIBoxes(boxes);
    }

    private placeTextElementGroup(
        groupState: TextElementGroupState,
        mapViewState: MapViewState,
        maxNumPlacedLabels: number,
        pass: Pass
    ) {
        if (this.m_textRenderers.length === 0) {
            logger.warn("No text renderers initialized.");
            return;
        }

        const textElementStates = groupState.sortedTextElementStates(
            this.m_mapView.viewRanges.maximum
        );

        const shieldGroups: number[][] = [];

        const temp: TempParams = {
            additionParams: {},
            poiMeasurementParams: {},
            measurementParams: {},
            bufferAdditionParams: {}
        };
        const tileGeometryManager = this.m_mapView.tileGeometryManager;
        const hiddenKinds =
            tileGeometryManager !== undefined ? tileGeometryManager.hiddenGeometryKinds : undefined;

        for (const textElementState of textElementStates) {
            if (pass === Pass.PersistentLabels) {
                if (placementStats) {
                    ++placementStats.total;
                }
            }
            if (
                maxNumPlacedLabels >= 0 &&
                mapViewState.numRenderedTextElements >= maxNumPlacedLabels
            ) {
                logger.debug("Placement label limit exceeded.");
                break;
            }

            // Skip all labels that are not initialized (didn't pass early placement tests)
            // or don't belong to this pass.
            if (!textElementState.initialized) {
                if (placementStats) {
                    ++placementStats.uninitialized;
                }
                continue;
            }
            if (textElementState.viewDistance === undefined) {
                if (placementStats) {
                    ++placementStats.tooFar;
                }
                continue;
            }

            if (
                (pass === Pass.PersistentLabels && !textElementState.visible) ||
                (pass === Pass.NewLabels && textElementState.visible)
            ) {
                continue;
            }

            const textElement = textElementState.element;

            // Get the TextElementStyle.
            const textElementStyle = this.getTextElementStyle(textElement.style);
            const textCanvas = textElementStyle.textCanvas;
            const poiRenderer = textElementStyle.poiRenderer;
            if (textCanvas === undefined || poiRenderer === undefined) {
                logger.warn("Text canvas or poi renderer not ready.");
                continue;
            }

            // TODO: HARP-7648. Discard hidden kinds sooner, before placement.
            // Check if the label should be hidden.
            if (
                hiddenKinds !== undefined &&
                textElement.kind !== undefined &&
                hiddenKinds.hasOrIntersects(textElement.kind)
            ) {
                continue;
            }

            const isPathLabel = textElement.isPathLabel;
            let screenPoints: THREE.Vector2[];

            // For paths, check if the label may fit.
            if (isPathLabel) {
                // TODO: HARP-7648. checkForSmallLabels takes a large part of text placement time.
                // Try to make it faster or execute cheaper rejection tests before.
                const screenPointsResult = this.checkForSmallLabels(textElement);
                if (screenPointsResult === undefined) {
                    if (placementStats) {
                        placementStats.numNotVisible++;
                    }
                    if (textElement.dbgPathTooSmall === true) {
                        if (placementStats) {
                            placementStats.numPathTooSmall++;
                        }
                    }
                    textElementState.reset();
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
                        temp.poiMeasurementParams.letterCaseArray = textElement.glyphCaseArray!;
                        textCanvas.measureText(
                            textElement.glyphs!,
                            textElement.bounds,
                            temp.poiMeasurementParams
                        );
                    }
                    textElement.loadingState = LoadingState.Initialized;
                    ++this.m_initializedTextElementCount;
                }
            }
            if (textElement.loadingState !== LoadingState.Initialized) {
                continue;
            }

            const layer = textCanvas.getLayer(textElement.renderOrder || DEFAULT_TEXT_CANVAS_LAYER);

            // Move onto the next TextElement if we cannot continue adding glyphs to this layer.
            if (layer !== undefined) {
                if (layer.storage.drawCount + textElement.glyphs!.length > layer.storage.capacity) {
                    if (placementStats) {
                        ++placementStats.numCannotAdd;
                    }
                    logger.warn("layer glyph storage capacity exceeded.");
                    continue;
                }
            }

            // Set the current style for the canvas.
            textCanvas.textRenderStyle = textElement.renderStyle!;
            textCanvas.textLayoutStyle = textElement.layoutStyle!;

            // Place a POI...
            if (textElement.isPoiLabel) {
                this.addPoiLabel(
                    textElementState,
                    groupState,
                    poiRenderer,
                    textCanvas,
                    mapViewState,
                    temp
                );
            }
            // ... a line marker...
            else if (textElement.isLineMarker) {
                this.addLineMarkerLabel(
                    textElementState,
                    groupState,
                    poiRenderer,
                    shieldGroups,
                    textCanvas,
                    mapViewState,
                    temp
                );
            }
            // ... or a path label.
            else if (isPathLabel) {
                this.addPathLabel(
                    textElementState,
                    groupState,
                    screenPoints!,
                    textCanvas,
                    mapViewState,
                    temp
                );
            }
        }
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

    /**
     * Visit all visible tiles and add/ their text elements to cache. The update of
     * [[TextElement]]s is a time consuming process, and cannot be done every frame, but should only
     * be done when the camera moved (a lot) of whenever the set of visible tiles change.
     *
     * The actually rendered [[TextElement]]s are stored internally until the next update is done
     * to speed up rendering when no camera movement was detected.
     */
    private updateTextElements() {
        logger.debug("updateTextElements");

        if (updateStats) {
            updateStats.clear();
        }

        this.m_cacheInvalidated = false;

        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;

        this.checkIfOverloaded();

        const updateStartTime =
            this.overloaded && this.m_mapView.isDynamicFrame ? PerformanceTimer.now() : undefined;

        // TODO: HARP-7648. Skip all data sources that won't contain text.
        // TODO: HARP-7651. Higher priority labels should be updated before lower priority ones
        // across all data sources.
        // TODO: HARP-7373. Use rendered tiles (tiles currently rendered to cover the view,
        // including fallbacks if necessary) instead of visible tiles (target tiles that might not
        // be decoded yet).
        // Otherwise labels persistent when crossing a zoom level boundary will flicker (fade out
        // and back in) due to the delay in decoding the visible tiles.
        renderList.forEach(tileList => {
            this.updateTextElementsFromSource(
                tileList.dataSource,
                tileList.storageLevel,
                tileList.visibleTiles,
                updateStartTime
            );
        });

        if (updateStats) {
            updateStats.log();
        }
    }

    private updateTextElementsFromSource(
        tileDataSource: DataSource,
        storageLevel: number,
        visibleTiles: Tile[],
        updateStartTime: number | undefined
    ) {
        if (updateStats) {
            updateStats.tiles += visibleTiles.length;
        }
        const sortedTiles = visibleTiles;

        // TODO: HARP-7648. Really needed? Should it be done here or in VisibleTileSet?
        sortedTiles.sort((a: Tile, b: Tile) => {
            return a.tileKey.mortonCode() - b.tileKey.mortonCode();
        });

        // Prepare user text elements.
        for (const tile of sortedTiles) {
            this.prepareTextElementGroup(tile.userTextElements, tile);
        }

        const sortedGroups: TextElementLists[] = [];
        this.createSortedGroupsForSorting(tileDataSource, storageLevel, sortedTiles, sortedGroups);

        let numTextElementsUpdated = 0;

        for (const textElementLists of sortedGroups) {
            this.selectTextElementsToUpdateByDistance(textElementLists);

            // The value of updateStartTime is set if this.overloaded is true.
            if (updateStartTime !== undefined) {
                // If overloaded and all time is used up, exit early.
                if (OVERLOAD_UPDATE_TIME_LIMIT > 0) {
                    const endTime = PerformanceTimer.now();
                    const elapsedTime = endTime - updateStartTime;
                    if (elapsedTime > OVERLOAD_UPDATE_TIME_LIMIT) {
                        logger.debug("Update time limit exceeded.");
                        break;
                    }
                }

                // Try not to update too many elements. They will be checked for visibility each
                // frame.
                numTextElementsUpdated += textElementLists.count();
                if (numTextElementsUpdated >= OVERLOAD_UPDATED_LABEL_LIMIT) {
                    logger.debug("Update label limit exceeded.");
                    break;
                }
            }
        }
    }

    private prepareTextElementGroup(
        textElementGroup: TextElementGroup,
        tile: Tile,
        maxViewDistance?: number
    ) {
        if (textElementGroup.elements.length === 0) {
            return;
        }

        const worldOffsetX = this.m_mapView.projection.worldExtent(0, 0).max.x * tile.offset;

        const textElementSelection: TextElementFilter = (
            textElement: TextElement,
            lastFrameNumber?: number
        ): number | undefined => {
            const { result, viewDistance } = checkReadyForPlacement(
                textElement,
                tile,
                worldOffsetX,
                this.m_mapView,
                this.m_textElementStateCache,
                maxViewDistance,
                lastFrameNumber
            );
            if (updateStats) {
                updateStats.totalLabels++;
                updateStats.results[result]++;
            }
            return viewDistance;
        };

        const [, found] = this.m_textElementStateCache.getOrSet(
            textElementGroup,
            textElementSelection
        );

        if (updateStats) {
            ++updateStats.totalGroups;
            if (!found) {
                ++updateStats.newGroups;
            }
        }
    }

    private createSortedGroupsForSorting(
        tileDataSource: DataSource,
        storageLevel: number,
        sortedTiles: Tile[],
        sortedGroups: TextElementLists[]
    ) {
        if (sortedTiles.length === 0) {
            return;
        }

        const tilesToRender: Tile[] = [];

        for (const tile of sortedTiles) {
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
                        new TextElementLists([new TileTextElements(tile, group)])
                    );
                } else {
                    foundGroup.lists.push(new TileTextElements(tile, group));
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
                for (const tileTextElements of textElementLists.lists) {
                    size += tileTextElements.group.elements.length;
                }
                outString += `priority ${textElementLists.priority} size: ${size}\n`;
            }
            logger.log(outString);
        }
    }

    private selectTextElementsToUpdateByDistance(textElementLists: TextElementLists) {
        const farDistanceLimitRatio = Math.max(
            this.m_maxDistanceRatioForTextLabels!,
            this.m_maxDistanceRatioForPoiLabels!
        );
        const maxViewDistance = getMaxViewDistance(this.m_mapView, farDistanceLimitRatio);

        for (const tileTextElements of textElementLists.lists) {
            this.prepareTextElementGroup(
                tileTextElements.group,
                tileTextElements.tile,
                maxViewDistance
            );
        }
    }

    /**
     * Place cached [[TextElement]]s.
     *
     * @param time Current time for animations.
     * @param frameNumber Integer number incremented every frame.
     */
    private placeTextElements(time: number, frameNumber: number) {
        const mapViewState: MapViewState = {
            cameraIsMoving: this.m_mapView.cameraIsMoving,
            maxVisibilityDist: this.m_mapView.viewRanges.maximum,
            zoomLevel: this.m_mapView.zoomLevel,
            frameNumber,
            time,
            numRenderedTextElements: 0,
            fadeAnimationRunning: false
        };

        const placeStartTime =
            this.overloaded && this.m_mapView.isDynamicFrame ? PerformanceTimer.now() : undefined;

        if (placementStats) {
            placementStats.clear();
        }

        if (this.m_textElementStateCache.size === 0) {
            logger.debug("Text element cache empty.");
            return;
        }

        const maxNumPlacedTextElements = this.m_maxNumVisibleLabels!;

        // TODO: HARP-7648. Potential performance improvement. Place persistent labels + rejected
        // candidates from previous frame if there's been no placement in this one.
        const groupStates = this.m_textElementStateCache.sortedGroupStates;
        let currentPriority: number = groupStates[0].priority;
        let currentPriorityBegin: number = 0;

        for (let i = 0; i < groupStates.length; ++i) {
            const textElementGroupState = groupStates[i];
            if (placementStats) {
                ++placementStats.totalGroups;
                if (textElementGroupState.needsSorting) {
                    ++placementStats.resortedGroups;
                }
            }

            const newPriority = textElementGroupState.priority;
            if (currentPriority !== newPriority) {
                // Place all new labels of the previous priority before placing the persistent
                // labels of this priority.
                this.placeNewTextElements(currentPriorityBegin, i, mapViewState);
                if (isPlacementTimeExceeded(placeStartTime)) {
                    break;
                }
                currentPriority = newPriority;
                currentPriorityBegin = i;
            }
            this.placeTextElementGroup(
                textElementGroupState,
                mapViewState,
                maxNumPlacedTextElements,
                Pass.PersistentLabels
            );

            if (isPlacementTimeExceeded(placeStartTime)) {
                break;
            }
        }

        // Place new text elements of the last priority.
        this.placeNewTextElements(currentPriorityBegin, groupStates.length, mapViewState);

        if (placementStats) {
            placementStats.numRenderedTextElements = mapViewState.numRenderedTextElements;
            placementStats.log();
        }

        if (!this.m_mapView.disableFading && mapViewState.fadeAnimationRunning) {
            this.m_mapView.update();
        }
    }

    private placeNewTextElements(
        beginGroupIndex: number,
        endGroupIndex: number,
        mapViewState: MapViewState
    ) {
        const groupStates = this.m_textElementStateCache.sortedGroupStates;
        for (let i = beginGroupIndex; i < endGroupIndex; ++i) {
            this.placeTextElementGroup(
                groupStates[i],
                mapViewState,
                this.m_maxNumVisibleLabels!,
                Pass.NewLabels
            );
        }
    }

    private placeOverlayTextElements() {
        const screenSize = this.m_mapView.renderer.getSize(this.m_tmpVector);
        const screenXOrigin = -screenSize.width / 2.0;
        const screenYOrigin = screenSize.height / 2.0;

        const tempAdditionParams: AdditionParameters = {};
        const tempBufferAdditionParams: TextBufferAdditionParameters = {};

        // Place text elements one by one.
        for (const textElement of this.m_overlayTextElements!) {
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
                // TODO: HARP-7648. Optimize array allocations.
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

    private getDistanceFadingFactor(
        label: TextElement,
        state: TextElementState,
        maxVisibilityDist: number
    ): number {
        let distanceFadeValue = 1.0;
        const textDistance = state.viewDistance;

        if (textDistance !== undefined && label.fadeFar !== undefined && label.fadeFar > 0.0) {
            const fadeNear = label.fadeNear === undefined ? 0.0 : label.fadeNear;
            const fadeFar = label.fadeFar;
            if (fadeFar > fadeNear) {
                distanceFadeValue =
                    1.0 -
                    THREE.Math.clamp(
                        (textDistance / maxVisibilityDist - fadeNear) / (fadeFar - fadeNear),
                        0.0,
                        1.0
                    );
            }
        }
        return distanceFadeValue;
    }

    private addPointLabel(
        pointLabel: TextElement,
        labelState: TextElementState,
        groupState: TextElementGroupState,
        position: THREE.Vector3,
        screenPosition: THREE.Vector2,
        poiRenderer: PoiRenderer,
        textCanvas: TextCanvas,
        mapViewState: MapViewState,
        temp: TempParams
    ): boolean {
        const textRenderState: RenderState = labelState.textRenderState!;
        const iconRenderState: RenderState = labelState.iconRenderState!;
        const poiTextMaxDistance = getMaxViewDistance(
            this.m_mapView,
            this.m_maxDistanceRatioForPoiLabels!
        );

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
            (pointLabel.layoutStyle!.verticalAlignment === VerticalAlignment.Below ? -1.0 : 1.0);
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
                (pointLabel.fadeFar <= 0.0 ||
                    pointLabel.fadeFar * mapViewState.maxVisibilityDist < textDistance)
            ) {
                // The label is farther away than fadeFar value, which means it is totally
                // transparent.
                if (placementStats) {
                    ++placementStats.tooFar;
                }
                return false;
            }
            labelState.setViewDistance(textDistance, groupState);

            distanceScaleFactor = this.getDistanceScalingFactor(pointLabel, textDistance);
            textScale *= distanceScaleFactor;
        }
        const distanceFadeFactor = this.getDistanceFadingFactor(
            pointLabel,
            labelState,
            mapViewState.maxVisibilityDist
        );

        // Check if there is need to check for screen space for the label's icon.
        const poiInfo = pointLabel.poiInfo;
        let iconSpaceAvailable = true;

        // Check if icon should be rendered at this zoomLevel
        let renderIcon =
            poiInfo !== undefined &&
            groupState.visited &&
            MathUtils.isClamped(
                mapViewState.zoomLevel,
                poiInfo.iconMinZoomLevel,
                poiInfo.iconMaxZoomLevel
            );

        if (renderIcon && poiRenderer.prepareRender(pointLabel, mapViewState.zoomLevel)) {
            if (poiInfo!.isValid === false) {
                if (placementStats) {
                    ++placementStats.numNotVisible;
                }
                return false;
            }

            const iconIsVisible = poiRenderer.computeScreenBox(
                poiInfo!,
                tempPoiScreenPosition,
                distanceScaleFactor,
                this.m_screenCollisions,
                mapViewState.zoomLevel,
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
                        if (placementStats) {
                            ++placementStats.numNotVisible;
                        }
                        return false;
                    } else if (!(poiInfo!.mayOverlap === true) && !iconRenderState.isFadingOut()) {
                        iconRenderState.startFadeOut(mapViewState.frameNumber, mapViewState.time);
                        if (textRenderState.isVisible()) {
                            textRenderState.startFadeOut(
                                mapViewState.frameNumber,
                                mapViewState.time
                            );
                        }
                    }
                } else {
                    if (
                        iconRenderState.lastFrameNumber < mapViewState.frameNumber - 1 ||
                        iconRenderState.isFadingOut() ||
                        iconRenderState.isFadedOut()
                    ) {
                        iconRenderState.startFadeIn(mapViewState.frameNumber, mapViewState.time);
                    }
                }
            }
            // If the icon is prepared and valid, but just not visible, try again next time.
            else {
                // Forced making it un-current.
                iconRenderState.lastFrameNumber = -1;

                if (placementStats) {
                    ++placementStats.numNotVisible;
                }
                return false;
            }
        }

        // Check if label should be rendered at this zoomLevel
        const renderText =
            poiInfo === undefined ||
            mapViewState.zoomLevel === undefined ||
            MathUtils.isClamped(
                mapViewState.zoomLevel,
                poiInfo.iconMinZoomLevel,
                poiInfo.iconMaxZoomLevel
            );

        // Check if we should render the label's text.
        const doRenderText =
            // Render if between min/max zoom level
            renderText &&
            // Do not render if the distance is too great and distance shouldn't be ignored.
            (pointLabel.ignoreDistance === true ||
                (labelState.viewDistance === undefined ||
                    labelState.viewDistance < poiTextMaxDistance)) &&
            // Do not render text if POI cannot be rendered and is not optional.
            (poiInfo === undefined || poiInfo.isValid === true || poiInfo.iconIsOptional !== false);

        // Render the label's text...
        // textRenderState is always defined at this point.
        if (doRenderText && pointLabel.text !== "") {
            // Adjust the label positioning to match its bounding box.
            tempPosition.x = tempScreenPosition.x;
            tempPosition.y = tempScreenPosition.y;
            tempPosition.z = labelState.renderDistance;

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
                if (placementStats) {
                    placementStats.numPoiTextsInvisible++;
                }
                labelState.reset();
                return false;
            }

            const textIsOptional: boolean =
                pointLabel.poiInfo !== undefined && pointLabel.poiInfo.textIsOptional === true;

            const textIsFadingIn = textRenderState.isFadingIn();
            const textIsFadingOut = textRenderState.isFadingOut();
            const textSpaceAvailable = !this.m_screenCollisions.isAllocated(tempBox2D);
            const textVisible =
                groupState.visited &&
                (pointLabel.textMayOverlap ||
                    textSpaceAvailable ||
                    textIsFadingIn ||
                    textIsFadingOut);

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
                        !mapViewState.cameraIsMoving ||
                        (poiInfo === undefined || poiInfo.renderTextDuringMovements === true)) &&
                    !iconRenderState.isFadedOut()
                ) {
                    let textFading = false;
                    if (
                        !textRenderState.isFadingOut() &&
                        textSpaceAvailable &&
                        iconSpaceAvailable
                    ) {
                        textFading = textRenderState.checkStartFadeIn(
                            mapViewState.frameNumber,
                            mapViewState.time,
                            true
                        );
                    } else {
                        textFading = textRenderState.isFading();
                    }

                    mapViewState.fadeAnimationRunning =
                        mapViewState.fadeAnimationRunning || textIsFadingOut || textFading;

                    const opacity = textRenderState.opacity;
                    const backgroundIsVisible =
                        pointLabel.renderStyle!.backgroundOpacity > 0 &&
                        textCanvas.textRenderStyle.fontSize.backgroundSize > 0;

                    temp.bufferAdditionParams.layer = pointLabel.renderOrder;
                    temp.bufferAdditionParams.position = tempPosition;
                    temp.bufferAdditionParams.scale = textScale;
                    temp.bufferAdditionParams.opacity =
                        opacity * distanceFadeFactor * pointLabel.renderStyle!.opacity;
                    temp.bufferAdditionParams.backgroundOpacity = backgroundIsVisible
                        ? temp.bufferAdditionParams.opacity *
                          pointLabel.renderStyle!.backgroundOpacity
                        : 0.0;
                    temp.bufferAdditionParams.pickingData = pointLabel.userData
                        ? pointLabel
                        : undefined;
                    textCanvas.addTextBufferObject(
                        pointLabel.textBufferObject!,
                        temp.bufferAdditionParams
                    );
                }
                if (placementStats) {
                    placementStats.numRenderedPoiTexts++;
                }
            } else if (!renderIcon || !textIsOptional) {
                // If the text is not visible nor optional, we won't render the icon neither.

                renderIcon = false;
                if (pointLabel.poiInfo === undefined || iconRenderState.isVisible()) {
                    if (pointLabel.poiInfo !== undefined) {
                        iconRenderState.startFadeOut(mapViewState.frameNumber, mapViewState.time);
                    }
                    if (textRenderState.isVisible()) {
                        const iconStartedFadeOut = textRenderState.checkStartFadeOut(
                            mapViewState.frameNumber,
                            mapViewState.time
                        );
                        mapViewState.fadeAnimationRunning =
                            mapViewState.fadeAnimationRunning || iconStartedFadeOut;
                    }
                } else {
                    if (placementStats) {
                        placementStats.numPoiTextsInvisible++;
                    }
                    return false;
                }
            }
            // If the label is currently visible, fade it out.
            else if (textRenderState.isVisible()) {
                const iconStartedFadeOut = textRenderState.checkStartFadeOut(
                    mapViewState.frameNumber,
                    mapViewState.time
                );
                mapViewState.fadeAnimationRunning =
                    mapViewState.fadeAnimationRunning || iconStartedFadeOut;
            }
        }
        // ... and render the icon (if any).
        if (renderIcon && poiRenderer.poiIsRenderable(poiInfo!)) {
            const iconStartedFadeIn = iconRenderState.checkStartFadeIn(
                mapViewState.frameNumber,
                mapViewState.time
            );
            mapViewState.fadeAnimationRunning =
                mapViewState.fadeAnimationRunning || iconStartedFadeIn;

            poiRenderer.renderPoi(
                poiInfo!,
                tempPoiScreenPosition,
                this.m_screenCollisions,
                labelState.renderDistance,
                distanceScaleFactor,
                poiInfo!.reserveSpace !== false,
                iconRenderState.opacity * distanceFadeFactor,
                mapViewState.zoomLevel
            );

            iconRenderState.lastFrameNumber = mapViewState.frameNumber;

            if (placementStats) {
                placementStats.numRenderedPoiIcons++;
            }
        }
        mapViewState.numRenderedTextElements++;
        return true;
    }

    private addPoiLabel(
        labelState: TextElementState,
        groupState: TextElementGroupState,
        poiRenderer: PoiRenderer,
        textCanvas: TextCanvas,
        mapViewState: MapViewState,
        temp: TempParams
    ): boolean {
        const poiLabel = labelState.element;

        // Calculate the world position of this label.
        tempPosition.copy(poiLabel.position).add(poiLabel.tileCenter!);

        // Only process labels frustum-clipped labels
        if (this.m_screenProjector.project(tempPosition, tempScreenPosition) === undefined) {
            return false;
        }
        // Add this POI as a point label.
        return this.addPointLabel(
            poiLabel,
            labelState,
            groupState,
            tempPosition,
            tempScreenPosition,
            poiRenderer,
            textCanvas,
            mapViewState,
            temp
        );
    }

    private addLineMarkerLabel(
        labelState: TextElementState,
        groupState: TextElementGroupState,
        poiRenderer: PoiRenderer,
        shieldGroups: number[][],
        textCanvas: TextCanvas,
        mapViewState: MapViewState,
        temp: TempParams
    ): void {
        const lineMarkerLabel = labelState.element;

        // Early exit if the line marker doesn't have the necessary data.
        const poiInfo = lineMarkerLabel.poiInfo!;
        if (
            lineMarkerLabel.path === undefined ||
            lineMarkerLabel.path.length === 0 ||
            !poiRenderer.prepareRender(lineMarkerLabel, mapViewState.zoomLevel)
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

        const lineTechnique = poiInfo.technique as LineMarkerTechnique;
        const minDistanceSqr =
            lineTechnique.minDistance !== undefined
                ? lineTechnique.minDistance * lineTechnique.minDistance
                : 0;

        // Process markers (with shield groups).
        if (minDistanceSqr > 0 && shieldGroup !== undefined) {
            for (const point of lineMarkerLabel.path) {
                // Calculate the world position of this label.
                tempPosition.copy(point).add(lineMarkerLabel.tileCenter!);

                // Only process labels frustum-clipped labels
                if (
                    this.m_screenProjector.project(tempPosition, tempScreenPosition) !== undefined
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
                            this.addPointLabel(
                                lineMarkerLabel,
                                labelState,
                                groupState,
                                tempPosition,
                                tempScreenPosition,
                                poiRenderer,
                                textCanvas,
                                mapViewState,
                                temp
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
            for (const point of lineMarkerLabel.path) {
                // Calculate the world position of this label.
                tempPosition.copy(point).add(lineMarkerLabel.tileCenter!);

                // Only process labels frustum-clipped labels
                if (
                    this.m_screenProjector.project(tempPosition, tempScreenPosition) !== undefined
                ) {
                    this.addPointLabel(
                        lineMarkerLabel,
                        labelState,
                        groupState,
                        tempPosition,
                        tempScreenPosition,
                        poiRenderer,
                        textCanvas,
                        mapViewState,
                        temp
                    );
                }
            }
        }
    }

    private addPathLabel(
        labelState: TextElementState,
        groupState: TextElementGroupState,
        screenPoints: THREE.Vector2[],
        textCanvas: TextCanvas,
        mapViewState: MapViewState,
        temp: TempParams
    ): boolean {
        // TODO: HARP-7649. Add fade out transitions for path labels.
        const textMaxDistance = getMaxViewDistance(
            this.m_mapView,
            this.m_maxDistanceRatioForTextLabels!
        );
        const pathLabel = labelState.element;

        // Limit the text rendering of path labels in the far distance.
        if (
            !(
                pathLabel.ignoreDistance === true ||
                labelState.viewDistance === undefined ||
                labelState.viewDistance < textMaxDistance
            )
        ) {
            if (placementStats) {
                ++placementStats.tooFar;
            }
            labelState.reset();
            return false;
        }

        if (
            pathLabel.fadeFar !== undefined &&
            (pathLabel.fadeFar <= 0.0 ||
                pathLabel.fadeFar * mapViewState.maxVisibilityDist < labelState.renderDistance)
        ) {
            // The label is farther away than fadeFar value, which means it is totally
            // transparent
            if (placementStats) {
                ++placementStats.tooFar;
            }
            labelState.reset();
            return false;
        }

        if (!groupState.visited) {
            labelState.reset();
            return false;
        }

        // Compute values common for all glyphs in the label.
        let textScale = textCanvas.textRenderStyle.fontSize.size / 100.0;
        let opacity = pathLabel.renderStyle!.opacity;

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
        labelState.setViewDistance(
            computeViewDistance(this.m_mapView.worldCenter, pathLabel),
            groupState
        );
        const textRenderDistance = -labelState.renderDistance;

        // Scale the text depending on the label's distance to the camera.
        const distanceScaleFactor = this.getDistanceScalingFactor(pathLabel, textRenderDistance);
        textScale *= distanceScaleFactor;

        // Scale the path label correctly.
        const prevSize = textCanvas.textRenderStyle.fontSize.size;
        textCanvas.textRenderStyle.fontSize.size = textScale * 100;

        // Recalculate the text bounds for this path label. If measurement fails, the whole
        // label doesn't fit the path and should be discarded.
        temp.measurementParams.path = textPath;
        temp.measurementParams.outputCharacterBounds = tempBoxes;
        temp.measurementParams.letterCaseArray = pathLabel.glyphCaseArray!;

        // TODO: HARP-7648. TextCanvas.measureText does the placement as in TextCanvas.addText but
        // without storing the result. If the measurement succeeds, the placement work is done
        // twice.
        // This could be done in one step (e.g measureAndAddText). Collision test could be injected
        // in the middle as a function.
        if (!textCanvas.measureText(pathLabel.glyphs!, tempBox, temp.measurementParams)) {
            textCanvas.textRenderStyle.fontSize.size = prevSize;
            if (placementStats) {
                ++placementStats.numNotVisible;
            }
            labelState.reset();
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
                (!pathLabel.textMayOverlap && this.m_screenCollisions.isAllocated(tempBox2D))
            ) {
                textCanvas.textRenderStyle.fontSize.size = prevSize;
                if (placementStats) {
                    ++placementStats.numNotVisible;
                }
                return false;
            }
        }

        // Fade-in after skipping rendering during movement.
        // NOTE: Shouldn't this only happen once we know the label is gonna be visible?
        if (
            labelState.textRenderState!.state === FadingState.Undefined ||
            labelState.textRenderState!.lastFrameNumber < mapViewState.frameNumber - 1
        ) {
            labelState.textRenderState!.startFadeIn(mapViewState.frameNumber, mapViewState.time);
        }
        const startedFadeIn = labelState.textRenderState!.checkStartFadeIn(
            mapViewState.frameNumber,
            mapViewState.time
        );

        mapViewState.fadeAnimationRunning = mapViewState.fadeAnimationRunning || startedFadeIn;
        if (labelState.textRenderState!.isFading()) {
            opacity = labelState.textRenderState!.opacity * pathLabel.renderStyle!.opacity;
        }

        const prevOpacity = textCanvas.textRenderStyle.opacity;
        const prevBgOpacity = textCanvas.textRenderStyle.backgroundOpacity;
        const distanceFadeFactor = this.getDistanceFadingFactor(
            pathLabel,
            labelState,
            mapViewState.maxVisibilityDist
        );
        textCanvas.textRenderStyle.opacity = opacity * distanceFadeFactor;
        textCanvas.textRenderStyle.backgroundOpacity =
            textCanvas.textRenderStyle.opacity * pathLabel.renderStyle!.backgroundOpacity;

        tempPosition.z = labelState.renderDistance;

        temp.additionParams.path = textPath;
        temp.additionParams.layer = pathLabel.renderOrder;
        temp.additionParams.letterCaseArray = pathLabel.glyphCaseArray;
        temp.additionParams.pickingData = pathLabel.userData ? pathLabel : undefined;
        textCanvas.addText(pathLabel.glyphs!, tempPosition, temp.additionParams);

        // Allocate collision info if needed.
        if (pathLabel.textReservesSpace) {
            tempBox2D.x = tempScreenPosition.x + tempBox.min.x;
            tempBox2D.y = tempScreenPosition.y + tempBox.min.y;
            tempBox2D.w = tempBox.max.x - tempBox.min.x;
            tempBox2D.h = tempBox.max.y - tempBox.min.y;
            this.m_screenCollisions.allocate(tempBox2D);
        }

        mapViewState.numRenderedTextElements++;

        // Restore previous style values for text elements using the same style.
        textCanvas.textRenderStyle.fontSize.size = prevSize;
        textCanvas.textRenderStyle.opacity = prevOpacity;
        textCanvas.textRenderStyle.backgroundOpacity = prevBgOpacity;
        return true;
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

    private checkIfOverloaded(): boolean {
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;

        // Count the number of TextElements in the scene to see if we have to switch to
        // "overloadMode".
        let numTextElementsInScene = 0;

        renderList.forEach(renderListEntry => {
            for (const tile of renderListEntry.renderedTiles.values()) {
                numTextElementsInScene += tile.textElementGroups.count();
                numTextElementsInScene += tile.userTextElements.elements.length;
            }
        });
        this.m_overloaded = numTextElementsInScene > OVERLOAD_LABEL_LIMIT;

        if (this.m_overloaded) {
            logger.log("Overloaded Mode enabled.");
        }
        return this.m_overloaded;
    }
}
