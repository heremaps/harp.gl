/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FontCatalogConfig, LineMarkerTechnique, Theme } from "@here/datasource-protocol";
import {
    DEFAULT_FONT_CATALOG_NAME,
    DEFAULT_STYLE_NAME,
    DEFAULT_TEXT_RENDER_ORDER,
    FontCatalog,
    GLYPH_CACHE_TEXTURE_SIZE,
    GLYPH_CACHE_WIDTH,
    GlyphDirection,
    GlyphTextureCache,
    TextBackgroundMode,
    TextBackgroundModeStrings,
    TextBuffer,
    TextMaterialConstructor,
    TextRenderer,
    TextStyle
} from "@here/text-renderer";
import { GroupedPriorityList, LoggerManager, Math2D, MathUtils } from "@here/utils";
import * as THREE from "three";

import { ColorCache } from "../ColorCache";
import { DataSource } from "../DataSource";
import { MapView } from "../MapView";
import { PickObjectType, PickResult } from "../PickHandler";
import { PoiRenderer } from "../poi/PoiRenderer";
import { ScreenCollisions } from "../ScreenCollisions";
import { ScreenProjector } from "../ScreenProjector";
import { Tile } from "../Tile";
import { SimpleLineCurve, SimplePath } from "./SimplePath";
import { FadingState, RenderState, TextElement, TextPickResult } from "./TextElement";

const DEBUG_GLYPH_MESH = true;

const DEBUG_TEXT_LAYOUT = false;

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
const DEFAULT_MAX_DISTANCE_RATIO_FOR_TEXT_LABELS = 0.99;

/**
 * Distance to the camera (range: `[0.0, 1.0]`) from which label start to scale.
 */
const DEFAULT_LABEL_SCALE_START_DISTANCE = 0.4;

// Development flag: Enable debug print.
const PRINT_LABEL_DEBUG_INFO: boolean = false;

// Some punctuation characters (like: (, ), <, >, [,], {, }) need to be mirrored when rendering an
// RTL strign to preserve their instrinsic meaning.
// https://en.wikipedia.org/wiki/Basic_Latin_(Unicode_block)#Table_of_characters
const rtlMirroredCodepoints = [40, 41, 60, 62, 91, 93, 123, 125];

const logger = LoggerManager.instance.create("TextElementsRenderer");

// Cache the DevicePixelRatio here:
let devicePixelRatio = 1;

const tempCorners = new Array<THREE.Vector2>();
const tempGlyphBox = new THREE.Box2();
const tempGlyphBox2D = new Math2D.Box();
const tempWorldPos = new THREE.Vector3();

const tempPosition = new THREE.Vector3();
const tempScreenPosition = new THREE.Vector2();
const tempPoiScreenPosition = new THREE.Vector2();

const tempTransform = new THREE.Matrix4();
const tempTextBounds = new Math2D.Box();
const tempOffset = new THREE.Vector3();

const tempTextRect = { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity };
const tempTextLabelBounds = new THREE.Box2();
const tempV3 = new THREE.Vector3(0, 0, 0);
const tempV4 = new THREE.Vector4();

const tempScreenBox: Math2D.Box = new Math2D.Box();

enum PathPlacementError {
    None,
    Visibility,
    ExtremeAngle,
    PathOverflow,
    BufferOverflow
}

interface PathData {
    startIndex?: number;
    startOffset?: number;
    offset?: number;
    tangent?: THREE.Vector2;
    prevTangent?: THREE.Vector2;
    direction?: number;
    placementError?: PathPlacementError;
}

class TileTextElements {
    constructor(readonly tile: Tile, readonly textElements: TextElement[]) {}
}

class TextElementLists {
    constructor(readonly priority: number, readonly textElementLists: TileTextElements[]) {}
}

/**
 * @hidden
 *
 * Internal class to manage all text rendering.
 */
export class TextElementsRenderer {
    private m_debugGeometry?: THREE.BufferGeometry;
    private m_debugPositions?: THREE.BufferAttribute;
    private m_debugIndex?: THREE.BufferAttribute;
    private m_debugMesh?: THREE.Mesh;
    private m_positionCount = 0;
    private m_indexCount = 0;
    private m_textRenderer?: TextRenderer;
    private m_poiRenderer?: PoiRenderer;
    private m_fontCatalogs: Map<string, FontCatalog> = new Map();
    private m_textStyles: TextStyle[] = [];
    private m_defaultStyle: TextStyle = {
        name: DEFAULT_STYLE_NAME,
        fontCatalogName: DEFAULT_FONT_CATALOG_NAME,
        color: "#6d7477",
        bgMode: TextBackgroundModeStrings.Outline,
        bgColor: "#F7FBFD",
        bgFactor: 5,
        bgAlpha: 0.5,
        allCaps: false,
        smallCaps: false
    };
    private m_lastRenderedTextElements: TextElement[] = [];
    private m_secondChanceTextElements: TextElement[] = [];

    // TODO: Replace this for an array of textures when more fonts are in use.
    private m_debugGlyphTextureCacheMesh?: THREE.Mesh;
    private m_debugGlyphTextureCacheWireMesh?: THREE.LineSegments;

    private m_firstGlyphLoaded: boolean = false;

    /**
     * Create the `TextElementsRenderer` which selects which labels should be placed on screen as
     * a preprocessing step, which is not done every frame, and also renders the placed
     * [[TextElement]]s every frame.
     *
     * @param m_mapView MapView to render into
     * @param m_screenCollisions General 2D screen occlusion management, may be shared between
     *     instances.
     * @param m_screenProjector Projects 3D coordinates into screen space.
     * @param m_theme Theme defining  text styles.
     * @param m_maxNumVisibleLabels Maximum number of visible [[TextElement]]s.
     * @param m_numSecondChanceLabels Number of [[TextElement]] that will be rendered again.
     * @param m_maxDistanceRatioForLabels Maximum distance for [[TextElement]] and icons, expressed
     *          as a fraction of the distance between the near and far plane [0, 1.0].
     *          Defaults to `0.99`.
     * @param m_labelStartScaleDistance Distance at which the [[TextElement]]s start to apply their
     *          `distanceScale` value, expressed as a fraction of the distance between the near and
     *          far plane [0, 1.0]. Defaults to `0.4`.
     * @param m_textMaterialConstructor Factory method to allow to create custom font materials.
     */
    constructor(
        private m_mapView: MapView,
        private m_screenCollisions: ScreenCollisions,
        private m_screenProjector: ScreenProjector,
        private m_theme: Theme,
        private m_maxNumVisibleLabels: number | undefined,
        private m_numSecondChanceLabels: number | undefined,
        private m_maxDistanceRatioForLabels: number | undefined,
        private m_labelStartScaleDistance: number | undefined,
        private m_textMaterialConstructor: TextMaterialConstructor
    ) {
        if (this.m_maxNumVisibleLabels === undefined) {
            this.m_maxNumVisibleLabels = DEFAULT_MAX_NUM_RENDERED_TEXT_ELEMENTS;
        }
        if (this.m_numSecondChanceLabels === undefined) {
            this.m_numSecondChanceLabels = DEFAULT_MAX_NUM_SECOND_CHANCE_ELEMENTS;
        }
        if (this.m_maxDistanceRatioForLabels === undefined) {
            this.m_maxDistanceRatioForLabels = DEFAULT_MAX_DISTANCE_RATIO_FOR_TEXT_LABELS;
        }
        if (this.m_labelStartScaleDistance === undefined) {
            this.m_labelStartScaleDistance = DEFAULT_LABEL_SCALE_START_DISTANCE;
        }

        this.initTextRenderer();

        if (DEBUG_GLYPH_MESH) {
            const planeGeometry = new THREE.PlaneGeometry(
                GLYPH_CACHE_TEXTURE_SIZE / 2.5,
                GLYPH_CACHE_TEXTURE_SIZE / 2.5,
                GLYPH_CACHE_WIDTH,
                GLYPH_CACHE_WIDTH
            );
            const material = new THREE.MeshBasicMaterial({
                transparent: true,
                depthWrite: false,
                depthTest: false
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
        }

        if (DEBUG_TEXT_LAYOUT) {
            this.m_debugPositions = new THREE.BufferAttribute(new Float32Array(10 * 1024), 3);
            this.m_debugPositions.setDynamic(true);

            this.m_debugIndex = new THREE.BufferAttribute(new Uint32Array(10 * 1024), 1);
            this.m_debugIndex.setDynamic(true);

            this.m_debugGeometry = new THREE.BufferGeometry();

            this.m_debugGeometry.addAttribute("position", this.m_debugPositions);
            this.m_debugGeometry.setIndex(this.m_debugIndex);

            this.m_debugMesh = new THREE.Mesh(
                this.m_debugGeometry,
                new THREE.MeshBasicMaterial({
                    //wireframe: true,
                    color: "#f00"
                })
            );

            this.m_debugMesh.renderOrder = 1000;

            this.m_debugPositions.count = 0;
            this.m_debugIndex.count = 0;
        }
    }

    /**
     * Signal end of rendering of a frame, prepares for creating geometry from all buffers.
     */
    end() {
        if (
            !DEBUG_TEXT_LAYOUT ||
            this.m_debugPositions === undefined ||
            this.m_debugIndex === undefined
        ) {
            return;
        }

        if (this.m_positionCount > 0) {
            this.m_debugPositions.updateRange.count =
                this.m_positionCount * this.m_debugPositions.itemSize;
            this.m_debugPositions.needsUpdate = true;
        }

        this.m_debugPositions.count = this.m_positionCount * this.m_debugPositions.itemSize;

        if (this.m_indexCount > 0) {
            this.m_debugIndex.updateRange.count = this.m_indexCount;
            this.m_debugIndex.needsUpdate = true;
        }

        this.m_debugIndex.count = this.m_indexCount;

        this.m_positionCount = 0;
        this.m_indexCount = 0;
    }

    /**
     * Access the debug mesh which contains areas covered by text (even if no text is visible).
     */
    get debugMesh(): THREE.Mesh | undefined {
        return this.m_debugMesh;
    }

    /**
     * Render the text using the specified camera into the current canvas.
     *
     * @param renderer The WebGLRenderer to call.
     * @param camera Orthographic camera to use.
     */
    renderText(renderer: THREE.WebGLRenderer, camera: THREE.OrthographicCamera) {
        if (this.m_textRenderer !== undefined) {
            this.m_textRenderer.render(
                renderer,
                camera,
                this.m_mapView.cameraIsMoving ||
                    this.m_mapView.animating ||
                    this.m_mapView.updatePending
            );
        }
    }

    /**
     * Reset internal state at the beginning of a frame.
     */
    reset() {
        devicePixelRatio = window.devicePixelRatio;
        this.m_screenCollisions.reset();
        if (this.m_textRenderer !== undefined) {
            this.m_textRenderer.reset();
            this.m_poiRenderer!.reset();

            for (const fontCatalog of this.m_textRenderer.fontCatalogs) {
                const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
                    fontCatalog
                );
                if (glyphCache === undefined) {
                    logger.error("FontCatalog not used by text renderer: " + fontCatalog);
                    return;
                }
                glyphCache.resetBuffer();
            }
        }
    }

    /**
     * Create the geometries at the end of a frame before rendering them.
     *
     * @param renderer WebGLRenderer used to copy the glyphs.
     */
    update(renderer: THREE.WebGLRenderer) {
        if (this.m_textRenderer !== undefined) {
            this.m_textRenderer.update();
            this.m_poiRenderer!.update();

            for (const fontCatalog of this.m_textRenderer.fontCatalogs) {
                const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
                    fontCatalog
                );
                if (glyphCache === undefined) {
                    logger.error("FontCatalog not used by text renderer: " + fontCatalog);
                    return;
                }
                glyphCache.updateBuffer();
                glyphCache.updateTexture(renderer);
            }
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
     * Sets the debug option to render the internal [[GlyphTextureCache]]s into the canvas.
     */
    set debugGlyphTextureCache(value: boolean) {
        if (DEBUG_GLYPH_MESH) {
            this.m_debugGlyphTextureCacheMesh!.visible = value;
            this.m_debugGlyphTextureCacheWireMesh!.visible = value;
        }
    }

    /**
     * Render the user [[TextElement]]s.
     *
     * @param time Current time for animations.
     * @param frameNumber Integer number incremented every frame.
     */
    renderUserTextElements(time: number, frameNumber: number) {
        const textCache = new Map<string, THREE.Vector2[]>();
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;

        // Take the world position of the camera as the origin to compute the distance to the
        // text elements.
        const worldCenter = this.m_mapView.worldCenter.clone().add(this.m_mapView.camera.position);

        const zoomLevel = this.m_mapView.zoomLevel;

        // Render the user POIs first
        renderList.forEach(renderListEntry => {
            for (const tile of renderListEntry.visibleTiles) {
                for (const textElement of tile.userTextElements) {
                    // update distance
                    textElement.tileCenterX = tile.center.x;
                    textElement.tileCenterY = tile.center.y;
                    this.updateViewDistance(worldCenter, textElement);
                }

                this.renderTextElements(
                    tile.userTextElements,
                    time,
                    frameNumber,
                    zoomLevel,
                    textCache
                );
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
        const textCache = new Map<string, THREE.Vector2[]>();
        const renderList = this.m_mapView.visibleTileSet.dataSourceTileList;
        const zoomLevel = this.m_mapView.zoomLevel;

        if (this.m_lastRenderedTextElements.length === 0) {
            // Nothing has been rendered before, process the list of placed labels in all tiles.
            renderList.forEach(renderListEntry => {
                this.renderTileList(
                    renderListEntry.renderedTiles,
                    time,
                    frameNumber,
                    zoomLevel,
                    textCache,
                    this.m_lastRenderedTextElements,
                    this.m_secondChanceTextElements
                );
            });
        } else {
            //TODO: Avoid list allocation
            const allRenderableTextElements = this.m_lastRenderedTextElements.concat(
                this.m_secondChanceTextElements
            );
            this.renderTextElements(
                allRenderableTextElements,
                time,
                frameNumber,
                zoomLevel,
                textCache
            );
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

        if (this.m_textRenderer !== undefined) {
            this.m_textRenderer.pickTextElements(screenPosition, (pickData: any | undefined) => {
                pickHandler(pickData, PickObjectType.Text);
            });
        }

        if (this.m_poiRenderer !== undefined) {
            this.m_poiRenderer.pickTextElements(screenPosition, (pickData: any | undefined) => {
                pickHandler(pickData, PickObjectType.Icon);
            });
        }
    }

    /**
     * `true` if any resource used by any `FontCatalog` is still loading.
     */
    get loading(): boolean {
        if (!this.m_firstGlyphLoaded) {
            return true;
        }

        let isLoading = false;
        // tslint:disable-next-line:no-unused-variable
        for (const [fontCatalogName, fontCatalog] of this.m_fontCatalogs) {
            isLoading = isLoading || fontCatalog.loading;
        }
        return isLoading;
    }

    private initTextRenderer() {
        let defaultFontCatalogName: string | undefined;

        devicePixelRatio = window.devicePixelRatio;

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

        if (this.m_theme.textStyles === undefined) {
            this.m_theme.textStyles = [];
        }

        const styles = this.m_theme.textStyles;
        const themedDefaultStyle = styles.find(style => style.name === DEFAULT_STYLE_NAME);

        if (themedDefaultStyle !== undefined) {
            // The TextStyle named "default" overrides the old `defaultTextStyle` in `Theme`.
            this.m_defaultStyle = themedDefaultStyle;
        } else if (this.m_theme.defaultTextStyle !== undefined) {
            // The old `defaultTextStyle` in `Theme` is the new default.
            this.m_defaultStyle = this.m_theme.defaultTextStyle;
            this.m_defaultStyle.name = DEFAULT_STYLE_NAME;
            styles.push(this.m_defaultStyle);
        } else if (styles.length > 0) {
            // The first style in the list is the new default style.
            this.m_defaultStyle = styles[0];
            this.m_defaultStyle.name = DEFAULT_STYLE_NAME;
        } else {
            // Last fallback:
            styles.push(this.m_defaultStyle);
        }

        this.m_defaultStyle.fontCatalogName = defaultFontCatalogName;

        if (this.m_defaultStyle.color !== undefined) {
            this.m_mapView.defaultTextColor = new THREE.Color(this.m_defaultStyle.color);
        }

        this.loadThemeFonts(fontCatalogs);
    }

    private loadThemeFonts(fontCatalogs?: FontCatalogConfig[]) {
        if (fontCatalogs === undefined) {
            return;
        }

        const promises: Array<Promise<void>> = [];
        const missingFontCatalogs: string[] = [];
        fontCatalogs.forEach(fontCatalog => {
            const fontCatalogPromise: Promise<FontCatalog> = FontCatalog.load(
                fontCatalog.url,
                fontCatalog.name,
                () => {
                    this.m_mapView.update();
                }
            );
            const fontCatalogLoadedPromise: Promise<void> = fontCatalogPromise
                .then((fontCatalogInfo: FontCatalog) => {
                    this.m_fontCatalogs.set(fontCatalogInfo.name, fontCatalogInfo);
                    this.m_mapView.update();
                    return;
                })
                .catch((error: Error) => {
                    missingFontCatalogs.push(fontCatalog.name);
                    logger.error("failed to load font. ", error);
                });
            promises.push(fontCatalogLoadedPromise);
        });
        Promise.all(promises).then(() => {
            this.initTextStyles();
            this.createTextRenderer();
        });
    }

    private initTextStyles() {
        if (
            this.m_theme === undefined ||
            this.m_theme.textStyles === undefined ||
            this.m_theme.textStyles.length === undefined
        ) {
            return;
        }

        this.m_theme.textStyles.forEach(element => {
            this.m_textStyles.push({ ...element });
        });
        this.assignFontCatalogsToStyles();
    }

    private assignFontCatalogsToStyles() {
        let defaultFontCatalog: FontCatalog | undefined;
        this.m_fontCatalogs.forEach(fontCatalog => {
            if (defaultFontCatalog === undefined) {
                defaultFontCatalog = fontCatalog;
            }
        });
        for (const style of this.m_textStyles) {
            if (style.fontCatalog === undefined) {
                if (style.fontCatalogName !== undefined) {
                    style.fontCatalog = this.m_fontCatalogs.get(style.fontCatalogName);
                }
                if (style.fontCatalog === undefined) {
                    if (style.fontCatalogName !== undefined) {
                        logger.warn(
                            `FontCatalog '${style.fontCatalogName}' set in TextStyle`,
                            style,
                            "not found, using default fontCatalog."
                        );
                    }
                    style.fontCatalog = defaultFontCatalog;
                }
            }
        }
    }

    private createTextRenderer() {
        this.m_textRenderer = new TextRenderer(this.m_textStyles, this.m_textMaterialConstructor);
        if (this.debugMesh !== undefined) {
            this.m_textRenderer.sceneSet.getScene(DEFAULT_TEXT_RENDER_ORDER).add(this.debugMesh);
        }
        this.m_poiRenderer = new PoiRenderer(this.m_mapView, this.m_textRenderer.sceneSet);

        const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
            this.m_defaultStyle.fontCatalogName
        );
        if (glyphCache === undefined) {
            logger.error(
                "FontCatalog not used by text renderer: " + this.m_defaultStyle.fontCatalogName
            );
            return;
        }

        if (DEBUG_GLYPH_MESH) {
            (this.m_debugGlyphTextureCacheMesh!.material as THREE.MeshBasicMaterial).map =
                glyphCache.texture;
            this.m_textRenderer.sceneSet
                .getScene(DEFAULT_TEXT_RENDER_ORDER)
                .add(this.m_debugGlyphTextureCacheMesh!, this.m_debugGlyphTextureCacheWireMesh!);
        }

        this.m_mapView.update();
    }

    private updateViewDistance(
        worldCenter: THREE.Vector3,
        textElement: TextElement
    ): number | undefined {
        let viewDistance: number | undefined;

        if (
            textElement.points instanceof THREE.Vector2 ||
            textElement.points instanceof THREE.Vector3
        ) {
            // For POIs:
            const pos = textElement.position3;
            tempV3.x = pos.x + textElement.tileCenterX!;
            tempV3.y = pos.y + textElement.tileCenterY!;
            viewDistance = worldCenter.distanceTo(tempV3);
        } else if (Array.isArray(textElement.points)) {
            if (textElement.points.length === 1) {
                const posPoint = (textElement.points as THREE.Vector2[])[0];
                tempV3.x = posPoint.x + textElement.tileCenterX!;
                tempV3.y = posPoint.y + textElement.tileCenterY!;
                viewDistance = worldCenter.distanceTo(tempV3);
            } else if (textElement.points.length > 1) {
                const pathPoints = textElement.points as THREE.Vector2[];
                let posPoint = pathPoints[0];
                tempV3.x = posPoint.x + textElement.tileCenterX!;
                tempV3.y = posPoint.y + textElement.tileCenterY!;
                const viewDistance0 = worldCenter.distanceTo(tempV3);

                posPoint = pathPoints[pathPoints.length - 1];
                tempV3.x = posPoint.x + textElement.tileCenterX!;
                tempV3.y = posPoint.y + textElement.tileCenterY!;
                const viewDistance1 = worldCenter.distanceTo(tempV3);

                viewDistance = Math.min(viewDistance0, viewDistance1);
            }
        }

        textElement.currentViewDistance = viewDistance;
        return viewDistance;
    }

    private sortTextElements(textElements: TextElement[], maxViewDistance: number) {
        const distancePriorityFactor = 0.1;

        // Compute the sortPriority once for all elements, because the computation is done more
        // than once per element
        for (const textElement of textElements) {
            textElement.sortPriority =
                textElement.priority +
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

        renderList.forEach(tileList => {
            this.placeTextElements(
                tileList.dataSource,
                tileList.storageLevel,
                zoomLevel,
                tileList.visibleTiles
            );
        });

        this.m_lastRenderedTextElements.length = 0;
        this.m_secondChanceTextElements.length = 0;
    }

    private placeTextElements(
        tileDataSource: DataSource,
        storageLevel: number,
        zoomLevel: number,
        visibleTiles: Tile[]
    ) {
        for (const tile of visibleTiles) {
            this.prepareUserTextElements(tile);
        }

        const sortedGroups: TextElementLists[] = [];
        this.createSortedGroupsForSorting(tileDataSource, storageLevel, visibleTiles, sortedGroups);

        const textElementGroups: TextElement[][] = [];
        this.selectTextElementsToPlaceByDistance(zoomLevel, sortedGroups, textElementGroups);
    }

    /**
     * Process any (new) user [[TextElement]], which has not been placed by the PoiManager, to set
     * it up for rendering.
     *
     * @param tile The Tile to process all user [[TextElements]] of.
     */
    private prepareUserTextElements(tile: Tile) {
        for (const textElement of tile.userTextElements) {
            textElement.tileCenterX = tile.center.x;
            textElement.tileCenterY = tile.center.y;
        }
    }

    private createSortedGroupsForSorting(
        tileDataSource: DataSource,
        storageLevel: number,
        visibleTiles: Tile[],
        sortedGroups: TextElementLists[]
    ) {
        if (this.m_textRenderer === undefined || visibleTiles.length === 0) {
            return;
        }

        const tilesToRender: Tile[] = [];

        for (const tile of visibleTiles) {
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
        sortedGroups: TextElementLists[],
        textElementGroups: TextElement[][]
    ) {
        sortedGroups.sort((a: TextElementLists, b: TextElementLists) => {
            return b.priority - a.priority;
        });

        // Take the world position of the camera as the origin to compute the distance to the
        // text elements.
        const worldCenter = this.m_mapView.worldCenter.clone().add(this.m_mapView.camera.position);

        const farDistanceLimitRatio = this.m_maxDistanceRatioForLabels!;
        const maxDistance = this.getMaxDistance(farDistanceLimitRatio);

        for (const textElementLists of sortedGroups) {
            const textElementGroup: TextElement[] = [];
            for (const tileTextElements of textElementLists.textElementLists) {
                const tile = tileTextElements.tile;
                for (const textElement of tileTextElements.textElements) {
                    if (
                        MathUtils.isClamped(
                            zoomLevel,
                            textElement.minZoomLevel,
                            textElement.maxZoomLevel
                        )
                    ) {
                        continue;
                    }

                    textElement.tileCenterX = tile.center.x;
                    textElement.tileCenterY = tile.center.y;

                    const textDistance = this.updateViewDistance(worldCenter, textElement);

                    // If the distance is greater than allowed, skip it.
                    if (textDistance !== undefined && textDistance > maxDistance) {
                        continue;
                    }

                    tile.placedTextElements.add(textElement);
                }
            }
            textElementGroups.push(textElementGroup);
        }
    }

    private renderOverlayTextElements(textElements: TextElement[]) {
        if (this.m_textRenderer === undefined) {
            return;
        }

        const screenXOrigin = (-window.innerWidth * window.devicePixelRatio) / 2.0;
        const screenYOrigin = (window.innerHeight * window.devicePixelRatio) / 2.0;

        // Place text elements one by one.
        for (const textElement of textElements) {
            const textRendererBuffer = this.m_textRenderer.getTextRendererBufferForStyle(
                textElement.style
            );

            if (textRendererBuffer === undefined) {
                break;
            }

            // Get the objects used for placing all glyphs.
            const style = textRendererBuffer.textStyle;
            const fontCatalog = style.fontCatalog;
            const buffer = textRendererBuffer.textBuffer;

            // Get style options common to all glyphs.
            const bgMode =
                style.bgMode === TextBackgroundModeStrings.Glow
                    ? TextBackgroundMode.Glow
                    : TextBackgroundMode.Outline;
            const textScale = textElement.scale * devicePixelRatio;

            // Compute the codepoints for this text element (reshaping, allCaps) if needed.
            if (textElement.codePoints === undefined) {
                textElement.computeCodePoints(textElement.allCaps);
            }
            if (
                buffer === undefined ||
                !buffer.canAddElements(textElement.codePoints.length) ||
                fontCatalog === undefined
            ) {
                break;
            }

            // Get the GlyphTextureCache where the glyphs SDFs are stored.
            const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
                fontCatalog.name
            );
            if (glyphCache === undefined) {
                logger.error("FontCatalog not used by text renderer: " + fontCatalog.name);
                return;
            }

            // Check if the TextElement we're about to render has been fully loaded.
            if (!this.isTextElementLoaded(textElement, fontCatalog, style)) {
                continue;
            }

            // Define the point and path label placement functions.
            const addPointLabel = (pointLabel: TextElement) => {
                // Adjust the label positioning.
                tempScreenPosition.x = screenXOrigin;
                tempScreenPosition.y = screenYOrigin;
                if (pointLabel.xOffset !== undefined) {
                    tempScreenPosition.x += pointLabel.xOffset * devicePixelRatio;
                }
                if (pointLabel.yOffset !== undefined) {
                    tempScreenPosition.y -= pointLabel.yOffset * devicePixelRatio;
                }
                tempOffset.x = tempScreenPosition.x;
                tempOffset.y = tempScreenPosition.y;

                // TODO: Add support for horizontal alignment.

                // Add the label to the TextBuffer.
                if (pointLabel.bidirectional) {
                    this.addBidirectionalLabel(
                        pointLabel,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        tempOffset,
                        textScale,
                        1.0,
                        pointLabel.smallCaps!,
                        bgMode
                    );
                } else {
                    this.addDirectionalGlyphRun(
                        pointLabel,
                        pointLabel.textDirection,
                        0,
                        pointLabel.codePoints.length - 1,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        tempOffset,
                        textScale,
                        1.0,
                        pointLabel.smallCaps!,
                        bgMode
                    );
                }
            };
            const addPathLabel = (pathLabel: TextElement) => {
                // Get the screen points that define the label's segments and create a path with
                // them.
                // TODO: Optimize array allocations.
                const screenPoints: THREE.Vector2[] = [];
                for (const pt of pathLabel.path!) {
                    const pX = screenXOrigin + pt.x;
                    const pY = screenYOrigin - pt.y;
                    screenPoints.push(new THREE.Vector2(pX, pY));
                }
                const path = new SimplePath();
                for (let i = 0; i < screenPoints.length - 1; ++i) {
                    path.add(new SimpleLineCurve(screenPoints[i], screenPoints[i + 1]));
                }

                // Initialize the path data (if needed).
                const pathData = pathLabel as PathData;
                if (pathData.startIndex === undefined || pathData.startOffset === undefined) {
                    const screenParam = path.getParamAt(0.5);
                    pathData.startIndex = screenParam!.index;
                    pathData.startOffset = screenParam!.t * screenParam!.t;
                }

                // Compute the initial offset in the label.
                const lengths = path.getLengths();
                const l1 = lengths[THREE.Math.clamp(pathData.startIndex, 0, lengths.length - 1)];
                const l2 =
                    lengths[THREE.Math.clamp(pathData.startIndex + 1, 0, lengths.length - 1)];
                pathData.offset = THREE.Math.clamp(
                    l1 * (1 - pathData.startOffset) + l2 * pathData.startOffset,
                    0.0,
                    1.0
                );

                // Compute the path initial tangent and direction.
                pathData.tangent = path.getTangent(pathData.offset / path.getLength());
                pathData.direction = pathData.tangent && pathData.tangent.x < 0 ? -1 : 1;
                if (pathData.direction < 0) {
                    pathData.offset += pathLabel.textWidth * textScale;
                }

                // Add the label to the TextBuffer.
                if (pathLabel.bidirectional) {
                    this.addBidirectionalLabel(
                        pathLabel,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        tempOffset,
                        textScale,
                        1.0,
                        pathLabel.smallCaps!,
                        bgMode,
                        path
                    );
                } else {
                    this.addDirectionalGlyphRun(
                        pathLabel,
                        pathLabel.textDirection,
                        0,
                        pathLabel.codePoints.length - 1,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        tempOffset,
                        textScale,
                        1.0,
                        pathLabel.smallCaps!,
                        bgMode,
                        path
                    );
                }
            };

            // Render a point label...
            if (textElement.path === undefined || textElement.path.length <= 1) {
                addPointLabel(textElement);
            }
            // ... or a path label.
            else {
                addPathLabel(textElement);
            }
        }
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
        textCache: Map<string, THREE.Vector2[]>,
        renderedTextElements?: TextElement[],
        secondChanceTextElements?: TextElement[]
    ): number {
        if (this.m_textRenderer === undefined || this.m_poiRenderer === undefined) {
            return 0;
        }

        const currentlyRenderingPlacedElements = renderedTextElements === undefined;

        const printInfo = textElements.length > 5000;
        let numNotVisible = 0;
        let numPlacementIssue1 = 0;
        let numPlacementIssue2 = 0;
        let numPlacementIssue3 = 0;
        let numPlacementIssue4 = 0;
        let numCannotAdd = 0;
        let numRenderedPoiIcons = 0;
        let numRenderedPoiTexts = 0;
        let numPoiTextsInvisible = 0;

        const maxNumRenderedLabels = this.m_maxNumVisibleLabels!;
        const numSecondChanceLabels = this.m_numSecondChanceLabels!;
        const labelStartScaleDistance = this.m_labelStartScaleDistance!;
        let numRenderedTextElements = 0;

        const shieldGroups: number[][] = [];

        const textFarDistanceLimitRatio = 0.9;
        const textMaxDistance = this.getMaxDistance(textFarDistanceLimitRatio);
        const poiTextFarDistanceLimitRatio = 0.6;
        const poiTextMaxDistance = this.getMaxDistance(poiTextFarDistanceLimitRatio);

        const cameraIsMoving = this.m_mapView.cameraIsMoving;
        const poiRenderer = this.m_poiRenderer!;
        const cameraFar = this.m_mapView.camera.far;
        // Take the world position of the camera as the origin to compute the distance to the
        // tex elements.
        const worldCenter = this.m_mapView.worldCenter.clone().add(this.m_mapView.camera.position);

        // Keep track if we need to call another update() on MapView.
        let fadeAnimationRunning = false;

        // Place text elements one by one.
        for (const textElement of textElements) {
            if (
                !currentlyRenderingPlacedElements &&
                maxNumRenderedLabels >= 0 &&
                numRenderedTextElements >= maxNumRenderedLabels
            ) {
                break;
            }

            const textRendererBuffer = this.m_textRenderer.getTextRendererBufferForStyle(
                textElement.style,
                textElement.renderOrder
            );

            if (textRendererBuffer === undefined) {
                break;
            }

            // Get the objects used for placing all glyphs.
            const style = textRendererBuffer.textStyle;
            const fontCatalog = style.fontCatalog;
            const buffer = textRendererBuffer.textBuffer;

            // Get style options common to all glyphs.
            const bgMode =
                style.bgMode === TextBackgroundModeStrings.Glow
                    ? TextBackgroundMode.Glow
                    : TextBackgroundMode.Outline;

            // Compute the codepoints for this text element (reshaping, allCaps) if needed.
            if (textElement.codePoints === undefined) {
                textElement.computeCodePoints(textElement.allCaps);
            }

            if (
                buffer === undefined ||
                !buffer.canAddElements(textElement.codePoints.length) ||
                fontCatalog === undefined
            ) {
                break;
            }

            // Get the GlyphTextureCache where the glyphs SDFs are stored.
            const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
                fontCatalog.name
            );
            if (glyphCache === undefined) {
                logger.error("FontCatalog not used by text renderer: " + fontCatalog.name);
                return -1;
            }

            // Check if the TextElement we're about to render has been fully loaded.
            if (!this.isTextElementLoaded(textElement, fontCatalog, style)) {
                continue;
            }

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
                if (pointLabel.xOffset !== undefined) {
                    tempScreenPosition.x += pointLabel.xOffset * devicePixelRatio;
                }
                if (pointLabel.yOffset !== undefined) {
                    tempScreenPosition.y += pointLabel.yOffset * devicePixelRatio;
                }

                // Scale the text depending on the label's distance to the camera.
                let textScale = pointLabel.scale * devicePixelRatio;
                let distanceScale = 1.0;
                const textDistance = worldCenter.distanceTo(position);
                if (textDistance !== undefined) {
                    if (
                        pointLabel.fadeFar !== undefined &&
                        (pointLabel.fadeFar <= 0.0 || pointLabel.fadeFar * cameraFar < textDistance)
                    ) {
                        // The label is farther away than fadeFar value, which means it is totally
                        // transparent
                        return false;
                    }

                    const startScaleDistance = cameraFar * labelStartScaleDistance;
                    if (textDistance > startScaleDistance) {
                        distanceScale =
                            1.0 -
                            ((textDistance - startScaleDistance) /
                                (cameraFar - startScaleDistance)) *
                                (1.0 - pointLabel.distanceScale);
                        textScale *= distanceScale;
                    }
                    textElement.currentViewDistance = textDistance;
                }
                const distanceFadeFactor = this.getDistanceFadingFactor(pointLabel, cameraFar);

                // Check if there is need to check for screen space for the label's icon.
                const poiInfo = pointLabel.poiInfo;
                let iconSpaceAvailable = true;

                // Check if icon should be rendered at this zoomLevel
                const renderIcon =
                    poiInfo === undefined ||
                    !MathUtils.isClamped(
                        zoomLevel,
                        poiInfo.iconMinZoomLevel,
                        poiInfo.iconMaxZoomLevel
                    );

                if (renderIcon && poiInfo !== undefined && poiRenderer.prepareRender(poiInfo)) {
                    if (poiInfo.isValid === false) {
                        return false;
                    }

                    const iconIsVisible = poiRenderer.computeScreenBox(
                        poiInfo,
                        tempPoiScreenPosition,
                        distanceScale,
                        this.m_screenCollisions,
                        tempScreenBox
                    );

                    if (iconIsVisible) {
                        iconSpaceAvailable = poiRenderer.isSpaceAvailable(
                            this.m_screenCollisions,
                            tempScreenBox
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

                        // Forced making it uncurrent.
                        iconRenderState.lastFrameNumber = -1;

                        return false;
                    }
                    if (iconRenderState.isFading()) {
                        this.updateFading(iconRenderState, time);
                    }
                }

                // Check if label should be renderd at this zoomLevel
                const renderText =
                    poiInfo === undefined ||
                    zoomLevel === undefined ||
                    !MathUtils.isClamped(
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
                if (doRenderText && pointLabel.codePoints.length > 0) {
                    // Find the text bounding rect.
                    let penX = 0;
                    tempTextRect.x = Infinity;
                    tempTextRect.y = Infinity;
                    tempTextRect.width = -Infinity;
                    tempTextRect.height = -Infinity;

                    for (let i = 0; i < pointLabel.codePoints.length; ++i) {
                        const glyph = fontCatalog.getGlyph(
                            pointLabel.codePoints[i],
                            pointLabel.bold
                        );
                        if (glyph === undefined) {
                            continue;
                        }

                        const smallCapsScale =
                            pointLabel.convertedToUpperCase[i] && textElement.smallCaps
                                ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                                : 1.0;

                        const left = penX + glyph.offsetX;
                        const right = left + glyph.width * smallCapsScale;
                        const bottom = 0;
                        const top = bottom - glyph.offsetY + glyph.height * smallCapsScale;

                        if (left < tempTextRect.x) {
                            tempTextRect.x = left;
                        }
                        if (bottom < tempTextRect.y) {
                            tempTextRect.y = bottom;
                        }
                        if (right - tempTextRect.x > tempTextRect.width) {
                            tempTextRect.width = right - tempTextRect.x;
                        }
                        if (top - tempTextRect.y > tempTextRect.height) {
                            tempTextRect.height = top - tempTextRect.y;
                        }

                        penX += (glyph.advanceX + pointLabel.tracking) * smallCapsScale;
                    }
                    const scaledTextWidth = tempTextRect.width * textScale;
                    const scaledTextHeight = tempTextRect.height * textScale;

                    tempTextBounds.x =
                        tempScreenPosition.x - scaledTextWidth * textElement.horizontalAlignment;
                    tempTextBounds.y = tempScreenPosition.y - scaledTextHeight;
                    tempTextBounds.w = scaledTextWidth;
                    tempTextBounds.h = scaledTextHeight * 2.0;

                    // Adjust the label positioning to match its bounding box.
                    tempOffset.x = tempTextBounds.x;
                    tempOffset.y = tempTextBounds.y + scaledTextHeight;

                    // TODO: Make the margin configurable
                    tempTextBounds.x -= 4 * textScale;
                    tempTextBounds.y -= 2 * textScale;
                    tempTextBounds.w += 8 * textScale;
                    tempTextBounds.h += 4 * textScale;

                    // Check the text visibility.
                    if (!this.m_screenCollisions.isVisible(tempTextBounds)) {
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
                    const textSpaceAvailable = !this.m_screenCollisions.isAllocated(tempTextBounds);
                    const textVisible =
                        pointLabel.textMayOverlap ||
                        textSpaceAvailable ||
                        textIsFadingIn ||
                        textIsFadingOut;

                    if (textVisible) {
                        // Add the debug view of the text bounding box if needed.
                        if (DEBUG_TEXT_LAYOUT) {
                            this.addDebugBoundingBox();
                        }

                        // Allocate collision info if needed.
                        if (!textIsFadingOut && pointLabel.textReservesSpace) {
                            this.m_screenCollisions.allocate(tempTextBounds);
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

                            // Add the label to the TextBuffer.
                            if (pointLabel.bidirectional) {
                                this.addBidirectionalLabel(
                                    pointLabel,
                                    buffer,
                                    fontCatalog,
                                    glyphCache,
                                    tempOffset,
                                    textScale,
                                    opacity * distanceFadeFactor,
                                    pointLabel.smallCaps!,
                                    bgMode
                                );
                            } else {
                                this.addDirectionalGlyphRun(
                                    pointLabel,
                                    pointLabel.textDirection,
                                    0,
                                    pointLabel.codePoints.length - 1,
                                    buffer,
                                    fontCatalog,
                                    glyphCache,
                                    tempOffset,
                                    textScale,
                                    opacity * distanceFadeFactor,
                                    pointLabel.smallCaps!,
                                    bgMode
                                );
                            }
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
                        distanceScale,
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
                tempPosition.x = poiLabel.position.x + poiLabel.tileCenterX!;
                tempPosition.y = poiLabel.position.y + poiLabel.tileCenterY!;
                tempPosition.z = 0;

                // Only process labels frustum-clipped labels
                if (
                    this.m_screenProjector.project(tempPosition, tempScreenPosition) !== undefined
                ) {
                    // Initialize the POI's icon and text render states (fading).
                    if (poiLabel.iconRenderState === undefined) {
                        poiLabel.iconRenderState = new RenderState();
                        poiLabel.textRenderState = new RenderState();
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
                    !poiRenderer.prepareRender(poiInfo)
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

                        // Check if there is enough space in the buffer left for one more line
                        // marker
                        if (!buffer.canAddElements(lineMarkerLabel.codePoints.length)) {
                            break;
                        }

                        // Calculate the world position of this label.
                        tempPosition.x = point.x + lineMarkerLabel.tileCenterX!;
                        tempPosition.y = point.y + lineMarkerLabel.tileCenterY!;
                        tempPosition.z = 0;

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
                    // Check if there is enough space in the buffer left for all line markers.
                    if (
                        !buffer.canAddElements(
                            lineMarkerLabel.path.length * lineMarkerLabel.codePoints.length
                        )
                    ) {
                        return;
                    }

                    for (let i = 0; i < lineMarkerLabel.path.length; i++) {
                        const point = lineMarkerLabel.path[i];

                        // Calculate the world position of this label.
                        tempPosition.x = point.x + lineMarkerLabel.tileCenterX!;
                        tempPosition.y = point.y + lineMarkerLabel.tileCenterY!;
                        tempPosition.z = 0;

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

            const addPathLabel = (pathLabel: TextElement) => {
                // Limit the text rendering of path labels in the far distance.
                if (
                    !(
                        pathLabel.ignoreDistance === true ||
                        pathLabel.currentViewDistance === undefined ||
                        pathLabel.currentViewDistance < textMaxDistance
                    )
                ) {
                    return;
                }

                // Compute values common for all glyphs in the label.
                let textScale = pathLabel.scale * devicePixelRatio;
                let opacity = 1.0;
                const tileCenterX = pathLabel.tileCenterX!;
                const tileCenterY = pathLabel.tileCenterY!;
                // TODO: Use temporary.
                const firstPoint = pathLabel.path![0].clone();
                firstPoint.x += tileCenterX;
                firstPoint.y += tileCenterY;
                // It is expensive to transform all glyphs back to 3D to get the correct depth, so
                // the current distance used for sorting is applied here.

                // Scale the text depending on the label's distance to the camera.
                let distanceScale = 1.0;
                if (
                    pathLabel.fadeFar !== undefined &&
                    (pathLabel.fadeFar <= 0.0 ||
                        pathLabel.fadeFar * cameraFar < pathLabel.renderDistance)
                ) {
                    // The label is farther away than fadeFar value, which means it is totally
                    // transparent
                    return;
                }

                // Update the real rendering distance to have smooth fading and scaling
                this.updateViewDistance(worldCenter, pathLabel);
                const textRenderDistance = pathLabel.renderDistance;

                const startScaleDistance = cameraFar * labelStartScaleDistance;
                const renderDistance = -textRenderDistance;
                if (renderDistance > startScaleDistance) {
                    distanceScale =
                        1.0 -
                        ((renderDistance - startScaleDistance) / (cameraFar - startScaleDistance)) *
                            (1.0 - pathLabel.distanceScale);
                    textScale *= distanceScale;
                }

                // Avoid rendering labels with the same text that share a similar position.
                // NOTE: Does this ever happen? We're dinamically allocating a map every frame just
                // for this.
                const cacheEntry = textCache.get(textElement.text);
                if (cacheEntry === undefined) {
                    textCache.set(textElement.text, [firstPoint]);
                } else {
                    let shouldSkip = false;
                    for (const pt of cacheEntry) {
                        if (
                            Math.abs(pt.x - firstPoint.x) < 0.001 &&
                            Math.abs(pt.y - firstPoint.y) < 0.001
                        ) {
                            shouldSkip = true;
                            break;
                        }
                    }
                    if (shouldSkip) {
                        return;
                    }
                    cacheEntry.push(firstPoint);
                }

                // Get the screen points that define the label's segments and create a path with
                // them.
                // TODO: Optimize array allocations.
                // TODO: (HARP-3515)
                //      The rendering of a path label that contains just a single point that is not
                //      visible is impossible, which is problematic with long paths.
                //      Fix: Skip/clip the invisible points at beginning and end of the path to get
                //      the visible part of the path.
                const screenPoints: THREE.Vector2[] = [];
                for (const pt of pathLabel.path!) {
                    tempWorldPos.set(pt.x + tileCenterX, pt.y + tileCenterY, 0);
                    const screenPoint = this.m_screenProjector.project(tempWorldPos);
                    if (screenPoint === undefined) {
                        return;
                    }
                    screenPoints.push(screenPoint);
                }
                const indexOfFirstVisibleScreenPoint = screenPoints.findIndex(p2 => {
                    if (this.m_screenCollisions.screenBounds.contains(p2.x, p2.y)) {
                        return true;
                    }
                    return false;
                });
                if (indexOfFirstVisibleScreenPoint === -1) {
                    numNotVisible++;
                    return;
                }
                const path = new SimplePath();
                for (let i = 0; i < screenPoints.length - 1; ++i) {
                    path.add(new SimpleLineCurve(screenPoints[i], screenPoints[i + 1]));
                }

                // Avoid placing labels that are bigger than their path.
                if (pathLabel.textWidth * textScale > path.getLength()) {
                    numPlacementIssue4++;
                    return;
                }

                // Initialize the path data (if needed).
                const pathData = pathLabel as PathData;
                if (pathData.startIndex === undefined && pathData.startOffset === undefined) {
                    const screenParam = path.getParamAt(0.5);
                    pathData.startIndex = screenParam!.index;

                    tempV4.set(
                        pathLabel.path![pathData.startIndex].x + tileCenterX,
                        pathLabel.path![pathData.startIndex].y + tileCenterY,
                        0,
                        1
                    );
                    this.m_screenProjector.projectVector(tempV4);
                    const w1 = tempV4.w;

                    tempV4.set(
                        pathLabel.path![pathData.startIndex + 1].x + tileCenterX,
                        pathLabel.path![pathData.startIndex + 1].y + tileCenterY,
                        0,
                        1
                    );
                    this.m_screenProjector.projectVector(tempV4);
                    const w2 = tempV4.w;

                    pathData.startOffset =
                        (screenParam!.t * w1) / (w2 + (w1 - w2) / screenParam!.t);
                }

                // Compute the initial offset in the label.
                const lengths = path.getLengths();
                const l1 = lengths[THREE.Math.clamp(pathData.startIndex!, 0, lengths.length - 1)];
                const l2 =
                    lengths[THREE.Math.clamp(pathData.startIndex! + 1, 0, lengths.length - 1)];
                pathData.offset = l1 * (1 - pathData.startOffset!) + l2 * pathData.startOffset!;
                if (pathData.offset > path.getLength()) {
                    numPlacementIssue1++;
                    return;
                }

                // Compute the path initial tangent and direction.
                pathData.tangent = path.getTangent(pathData.offset / path.getLength());
                pathData.direction = pathData.tangent && pathData.tangent.x < 0 ? -1 : 1;
                if (pathData.direction < 0) {
                    pathData.offset += pathLabel.textWidth * textScale;
                }

                // Fade-in after skipping rendering during movement.
                // NOTE: Shouldn't this only happen once we know the label is gonna be visible?
                if (pathLabel.textRenderState === undefined) {
                    pathLabel.textRenderState = new RenderState();
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
                    opacity = pathLabel.textRenderState.opacity;
                }

                const distanceFadeFactor = this.getDistanceFadingFactor(pathLabel, cameraFar);

                // Save the current TextBuffer state before adding the label (so we can restore it
                // if placement fails).
                const textBufferState = buffer.saveState();
                pathData.placementError = PathPlacementError.None;
                tempTextLabelBounds.makeEmpty();

                // Add the label to the TextBuffer.
                if (pathLabel.bidirectional) {
                    this.addBidirectionalLabel(
                        pathLabel,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        tempOffset,
                        textScale,
                        opacity * distanceFadeFactor,
                        pathLabel.smallCaps!,
                        bgMode,
                        path,
                        true
                    );
                } else {
                    this.addDirectionalGlyphRun(
                        pathLabel,
                        pathLabel.textDirection,
                        0,
                        pathLabel.codePoints.length - 1,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        tempOffset,
                        textScale,
                        opacity * distanceFadeFactor,
                        pathLabel.smallCaps!,
                        bgMode,
                        path,
                        true
                    );
                }

                // Check that everything was correct during placement before continuing.
                if (pathData.placementError !== PathPlacementError.None) {
                    buffer.restoreState(textBufferState);

                    if (pathData.placementError === PathPlacementError.Visibility) {
                        numNotVisible++;
                        if (
                            secondChanceTextElements !== undefined &&
                            secondChanceTextElements.length < this.m_numSecondChanceLabels!
                        ) {
                            secondChanceTextElements.push(textElement);
                        }
                    } else if (pathData.placementError === PathPlacementError.ExtremeAngle) {
                        numPlacementIssue3++;
                    } else if (pathData.placementError === PathPlacementError.PathOverflow) {
                        numPlacementIssue2++;
                    } else if (pathData.placementError === PathPlacementError.BufferOverflow) {
                        numCannotAdd++;
                    }

                    return;
                }

                // Add the debug view of the text bounding box if needed.
                if (DEBUG_TEXT_LAYOUT) {
                    this.addDebugBoundingBox();
                }

                // Allocate collision info if needed.
                if (pathLabel.textReservesSpace) {
                    ScreenCollisions.toBox2D(tempTextLabelBounds, tempGlyphBox2D);
                    this.m_screenCollisions.allocate(tempGlyphBox2D);
                }

                // Add this label to the list of rendered elements.
                if (renderedTextElements !== undefined) {
                    renderedTextElements.push(pathLabel);
                }
                numRenderedTextElements++;
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
            logger.log("numPlacementIssue1", numPlacementIssue1);
            logger.log("numPlacementIssue2", numPlacementIssue2);
            logger.log("numPlacementIssue3", numPlacementIssue3);
            logger.log("numPlacementIssue4", numPlacementIssue4);
            logger.log("numCannotAdd", numCannotAdd);
        }

        if (fadeAnimationRunning) {
            this.m_mapView.update();
        }
        return numRenderedTextElements;
    }

    private renderTileList(
        visibleTiles: Tile[],
        time: number,
        frameNumber: number,
        zoomLevel: number,
        textCache: Map<string, THREE.Vector2[]>,
        renderedTextElements?: TextElement[],
        secondChanceTextElements?: TextElement[]
    ) {
        if (this.m_textRenderer === undefined || visibleTiles.length === 0) {
            return;
        }

        const consideredTextElements = new GroupedPriorityList<TextElement>();

        for (const tile of visibleTiles) {
            consideredTextElements.merge(tile.placedTextElements);
        }

        const maxViewDistanceSqr = this.m_mapView.camera.far * this.m_mapView.camera.far;

        const maxNumRenderedTextElements = this.m_maxNumVisibleLabels!;
        let numRenderedTextElements = 0;

        for (const elementGroup of consideredTextElements.sortedGroups) {
            const textElementsInGroup = elementGroup.elements;

            this.sortTextElements(textElementsInGroup, maxViewDistanceSqr);

            numRenderedTextElements += this.renderTextElements(
                textElementsInGroup,
                time,
                frameNumber,
                zoomLevel,
                textCache,
                renderedTextElements,
                secondChanceTextElements
            );

            if (numRenderedTextElements > maxNumRenderedTextElements) {
                break;
            }
        }
    }

    private isTextElementLoaded(
        textElement: TextElement,
        fontCatalog: FontCatalog,
        style: TextStyle
    ): boolean {
        // Load all glyphs and store values computed after load on the TextElement.
        if (!textElement.allGlyphsLoaded) {
            const bold = textElement.bold !== undefined ? textElement.bold : style.bold === true;
            const tracking =
                textElement.tracking !== undefined
                    ? textElement.tracking
                    : style.tracking !== undefined
                        ? style.tracking
                        : 0.0;

            let width = 0;
            let direction;
            let allGlyphsLoaded = true;
            for (const codePoint of textElement.codePoints) {
                const glyph = fontCatalog.getGlyph(codePoint, bold);
                if (glyph === undefined) {
                    allGlyphsLoaded = false;
                    break;
                }
                this.m_firstGlyphLoaded = true;
                width += glyph.advanceX + tracking;

                if (direction === undefined) {
                    if (
                        glyph.direction === GlyphDirection.LTR ||
                        glyph.direction === GlyphDirection.RTL
                    ) {
                        direction = glyph.direction;
                    }
                } else if (direction !== glyph.direction) {
                    textElement.bidirectional = true;
                }
            }

            if (!allGlyphsLoaded) {
                return false;
            }

            const smallCaps =
                textElement.smallCaps !== undefined
                    ? textElement.smallCaps
                    : style.smallCaps === true;
            const allCaps =
                (textElement.allCaps !== undefined
                    ? textElement.allCaps
                    : style.allCaps === true) || smallCaps;
            const oblique =
                textElement.oblique !== undefined ? textElement.oblique : style.oblique === true;
            const color =
                textElement.color !== undefined
                    ? textElement.color
                    : style.color !== undefined
                        ? ColorCache.instance.getColor(style.color)
                        : this.m_mapView.defaultTextColor;

            textElement.allGlyphsLoaded = true;
            textElement.allCaps = allCaps;
            textElement.smallCaps = smallCaps;
            textElement.bold = bold;
            textElement.oblique = oblique;
            textElement.tracking = tracking;
            textElement.color = color;
            textElement.textWidth = width;
            textElement.textDirection = direction !== undefined ? direction : GlyphDirection.LTR;
        }

        return true;
    }

    private computeGlyphTransform(
        position: THREE.Vector3,
        scale: number,
        path?: SimplePath,
        pathData?: PathData
    ) {
        tempTransform.set(
            path !== undefined ? scale * pathData!.tangent!.x : scale,
            path !== undefined ? scale * -pathData!.tangent!.y : 0.0,
            0.0,
            position.x,
            path !== undefined ? scale * pathData!.tangent!.y : 0.0,
            path !== undefined ? scale * pathData!.tangent!.x : scale,
            0,
            position.y,
            0,
            0,
            scale,
            0,
            0,
            0,
            0,
            1
        );
    }

    private addDirectionalGlyphRun(
        textElement: TextElement,
        direction: GlyphDirection,
        firstCodePoint: number,
        lastCodePoint: number,
        buffer: TextBuffer,
        fontCatalog: FontCatalog,
        glyphCache: GlyphTextureCache,
        position: THREE.Vector3,
        scale: number,
        opacity: number,
        smallCaps: boolean,
        bgMode: TextBackgroundMode,
        path?: SimplePath,
        pathBounds?: boolean
    ): boolean {
        // Get the label extents.
        const start = direction === GlyphDirection.LTR ? firstCodePoint : lastCodePoint;
        const end = direction === GlyphDirection.LTR ? lastCodePoint : firstCodePoint;
        const pathData = textElement as PathData;

        // Place the glyph in their LTR display direction (which doesn't match the logical memory
        // order for RTL runs).
        for (
            let i = start;
            direction === GlyphDirection.LTR ? i <= end : i >= end;
            i += direction
        ) {
            const glyph = fontCatalog.getGlyph(textElement.codePoints[i], textElement.bold)!;
            glyphCache.add(glyph!.codepoint, textElement.bold);

            // If we're processing an RTL run and we find a weak (numeral) sequence, we should
            // render them as an LTR run.
            if (direction === GlyphDirection.RTL && glyph.direction === GlyphDirection.Weak) {
                // Find the start and end of the weak run.
                const weakRunEnd = i;
                let weakRunStart = i;
                let weakGlyph = fontCatalog.getGlyph(
                    textElement.codePoints[weakRunStart--],
                    textElement.bold
                )!;
                while (
                    weakGlyph.direction === GlyphDirection.Weak ||
                    (weakGlyph.direction === GlyphDirection.Neutral && weakGlyph.codepoint !== 32)
                ) {
                    weakGlyph = fontCatalog.getGlyph(
                        textElement.codePoints[weakRunStart--],
                        textElement.bold
                    )!;
                }
                weakRunStart += 2;

                // Add the extra LTR run.
                this.addDirectionalGlyphRun(
                    textElement,
                    GlyphDirection.LTR,
                    weakRunStart,
                    weakRunEnd,
                    buffer,
                    fontCatalog,
                    glyphCache,
                    position,
                    scale,
                    opacity,
                    smallCaps,
                    bgMode,
                    path
                );

                // Shift the glyph index accordingly.
                i = weakRunStart;
                continue;
            }

            // Check if glyph should be mirrored.
            const mirrored = rtlMirroredCodepoints.find(element => {
                return element === glyph.codepoint;
            });

            // Check if the glyph is in smallCaps
            const smallCapsScale =
                textElement.convertedToUpperCase[i] && smallCaps
                    ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                    : 1.0;

            // Compute the position of the glyph in the path (if any).
            if (path !== undefined) {
                const t0 = pathData.offset! / path.getLength();
                const t1 =
                    t0 +
                    (pathData.direction! * (glyph.width * scale * smallCapsScale)) /
                        path.getLength();

                // Check that we don't cover more area that the path defines.
                if (pathBounds === true) {
                    if (t0 < 0 || t0 > 1 || t1 < 0 || t1 > 1) {
                        pathData.placementError = PathPlacementError.PathOverflow;
                        return false;
                    }
                }

                const p0 = path.getPoint(THREE.Math.clamp(t0, 0.0, 1.0));
                const p1 = path.getPoint(THREE.Math.clamp(t1, 0.0, 1.0));
                pathData.tangent = p1.sub(p0).normalize();

                // Check that we don't try to place a label over a really acute angle.
                if (pathBounds === true) {
                    if (pathData.prevTangent !== undefined) {
                        const theta = Math.atan2(
                            pathData.prevTangent.x * pathData.tangent.y -
                                pathData.tangent.x * pathData.prevTangent.y,
                            pathData.tangent.dot(pathData.prevTangent)
                        );
                        if (Math.abs(theta) > Math.PI / 8) {
                            pathData.placementError = PathPlacementError.ExtremeAngle;
                            return false;
                        }
                    }
                    pathData.prevTangent = pathData.tangent;
                }

                p0.x += textElement.xOffset || 0.0;
                p0.y -= textElement.yOffset || 0.0;
                position.set(p0.x, p0.y, 0);
            }

            // Compute the transformation matrix for this glyph.
            this.computeGlyphTransform(position, scale, path, pathData);

            // Check that path labels' bounding boxes are visible.
            if (pathBounds === true) {
                FontCatalog.getGlyphCorners(
                    glyph,
                    tempTransform,
                    tempCorners,
                    true,
                    textElement.verticalAlignment,
                    textElement.oblique!
                );
                tempGlyphBox.setFromPoints(tempCorners);
                ScreenCollisions.toBox2D(tempGlyphBox, tempGlyphBox2D);
                if (
                    !this.m_screenCollisions.isVisible(tempGlyphBox2D) ||
                    (!textElement.textMayOverlap &&
                        this.m_screenCollisions.isAllocated(tempGlyphBox2D))
                ) {
                    pathData.placementError = PathPlacementError.Visibility;
                    return false;
                }
                tempTextLabelBounds.union(tempGlyphBox);
            }

            // Add the glyph to the TextBuffer.
            const result = buffer.addGlyph(
                glyph,
                textElement.color!,
                opacity,
                textElement.renderDistance,
                tempTransform,
                tempCorners,
                true,
                textElement.verticalAlignment,
                direction === GlyphDirection.RTL && mirrored !== undefined,
                textElement.oblique!,
                smallCapsScale !== 1.0,
                bgMode,
                textElement.poiInfo
            );

            // TODO: Add these errors to all types of labels.
            if (pathBounds === true && !result) {
                pathData.placementError = PathPlacementError.BufferOverflow;
                return false;
            }

            // Advance the label position (as well as the path position if needed).
            const glyphStep = (glyph.advanceX + textElement.tracking) * scale * smallCapsScale;
            position.x += glyphStep;
            if (path !== undefined) {
                pathData.offset! += pathData.direction! * glyphStep;
            }
        }

        return true;
    }

    private addBidirectionalLabel(
        textElement: TextElement,
        buffer: TextBuffer,
        fontCatalog: FontCatalog,
        glyphCache: GlyphTextureCache,
        position: THREE.Vector3,
        scale: number,
        opacity: number,
        smallCaps: boolean,
        bgMode: TextBackgroundMode,
        path?: SimplePath,
        pathBounds?: boolean
    ) {
        const origin = position.x;
        let offset = 0;

        let runOffset = 0;
        let runStart = 0;
        let runEnd = 0;

        let lastStrongDir;
        let lastStrongIdx = -1;
        let lastStrongOffset = -1;

        let currIdx = 0;
        let currDir = textElement.textDirection;
        while (currIdx !== textElement.codePoints.length) {
            // Get the currently proccessed glyph.
            const glyph = fontCatalog.getGlyph(textElement.codePoints[currIdx], textElement.bold)!;
            offset += (glyph.advanceX + textElement.tracking) * scale;

            // Get the surrounding glyphs.
            const prevGlyph = fontCatalog.getGlyph(
                textElement.codePoints[currIdx - 1],
                textElement.bold
            )!;
            const nextGlyph = fontCatalog.getGlyph(
                textElement.codePoints[currIdx + 1],
                textElement.bold
            )!;

            // Process weak glyphs.
            if (glyph.direction === GlyphDirection.Weak) {
                // Weak glyphs do not modify LTR runs and they're treated internally on RTL runs,
                // so no extra work is needed here.
            }
            // Process neutral glyphs.
            else if (glyph.direction === GlyphDirection.Neutral) {
                // If we're opening a neutral run, record the left-most strong dir.
                if (lastStrongDir === undefined) {
                    if (prevGlyph.direction !== GlyphDirection.Neutral) {
                        lastStrongDir = prevGlyph.direction;
                        lastStrongIdx = currIdx - 1;
                        lastStrongOffset = offset;
                    }
                }
                // If we have an open neutral run...
                if (lastStrongDir !== undefined && nextGlyph.direction !== GlyphDirection.Neutral) {
                    // Close it if it's between two runs with the same direction.
                    if (nextGlyph.direction === lastStrongDir) {
                        lastStrongDir = undefined;
                        lastStrongIdx = -1;
                        lastStrongOffset = -1;
                    }
                    // Render the previous glyphs if it means the end of a run.
                    else if (nextGlyph.direction === -lastStrongDir) {
                        runEnd =
                            lastStrongDir !== textElement.textDirection ? lastStrongIdx : currIdx;
                        position.x = origin + runOffset;
                        const result = this.addDirectionalGlyphRun(
                            textElement,
                            currDir,
                            runStart,
                            runEnd,
                            buffer,
                            fontCatalog,
                            glyphCache,
                            position,
                            scale,
                            opacity,
                            smallCaps,
                            bgMode,
                            path,
                            pathBounds
                        );
                        if (!result) {
                            return;
                        }

                        runOffset = lastStrongOffset;
                        runStart = runEnd + 1;
                        currDir = -currDir;

                        lastStrongDir = undefined;
                        lastStrongIdx = -1;
                        lastStrongOffset = -1;
                    }
                }
            }
            // Process strong glyphs.
            else {
                // If the following glyph changes the direction, process the current run.
                if (nextGlyph.direction === -currDir) {
                    runEnd = currIdx;
                    position.x = origin + runOffset;
                    const result = this.addDirectionalGlyphRun(
                        textElement,
                        currDir,
                        runStart,
                        runEnd,
                        buffer,
                        fontCatalog,
                        glyphCache,
                        position,
                        scale,
                        opacity,
                        smallCaps,
                        bgMode,
                        path,
                        pathBounds
                    );
                    if (!result) {
                        return;
                    }

                    runOffset = offset;
                    runStart = runEnd + 1;
                    currDir = -currDir;
                }
            }

            // Go for the next glyph.
            currIdx++;
        }

        // Process remaining glyphs.
        if (runStart < textElement.codePoints.length) {
            runEnd = currIdx - 1;
            position.x = origin + runOffset;
            const result = this.addDirectionalGlyphRun(
                textElement,
                currDir,
                runStart,
                runEnd,
                buffer,
                fontCatalog,
                glyphCache,
                position,
                scale,
                opacity,
                smallCaps,
                bgMode,
                path,
                pathBounds
            );
            if (!result) {
                return;
            }
        }
    }

    private addDebugBoundingBox() {
        if (this.m_debugPositions !== undefined && this.m_debugIndex !== undefined) {
            const baseVertex = this.m_positionCount;

            this.m_debugPositions.setXY(this.m_positionCount++, tempTextBounds.x, tempTextBounds.y);
            this.m_debugPositions.setXY(
                this.m_positionCount++,
                tempTextBounds.x + tempTextBounds.w,
                tempTextBounds.y
            );
            this.m_debugPositions.setXY(
                this.m_positionCount++,
                tempTextBounds.x,
                tempTextBounds.y + tempTextBounds.h
            );
            this.m_debugPositions.setXY(
                this.m_positionCount++,
                tempTextBounds.x + tempTextBounds.w,
                tempTextBounds.y + tempTextBounds.h
            );

            this.m_debugIndex.setX(this.m_indexCount++, baseVertex);
            this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 1);
            this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 2);
            this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 2);
            this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 1);
            this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 3);
        }
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
