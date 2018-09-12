/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { FontCatalogConfig, LineMarkerTechnique, Theme } from "@here/datasource-protocol";
import {
    DEFAULT_FONT_CATALOG_NAME,
    DEFAULT_STYLE_NAME,
    DEFAULT_TEXT_RENDER_ORDER,
    FontCatalog,
    GLYPH_CACHE_TEXTURE_SIZE,
    GLYPH_CACHE_WIDTH,
    TextBackgroundMode,
    TextBackgroundModeStrings,
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
import { FadingState, PoiInfo, RenderState, TextElement, TextPickResult } from "./TextElement";

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

const logger = LoggerManager.instance.create("TextElementsRenderer");

// Cache the DevicePixelRatio here:
let devicePixelRatio = 1;

const tempCorners = new Array<THREE.Vector2>();
const tempTransformMatrix = new THREE.Matrix4();
const tempRotationMatrix = new THREE.Matrix4();
const translationMatrix = new THREE.Matrix4();
const tempScale = new THREE.Vector3();
const tempGlyphBox = new THREE.Box2();
const tempGlyphBox2D = new Math2D.Box();
const tempWorldPos = new THREE.Vector3();

const tempPosition = new THREE.Vector3();
const tempPosition2 = new THREE.Vector3();
const tempScreenPosition = new THREE.Vector2();
const tempScreenPosition2 = new THREE.Vector2();
const tempScreenPosition3 = new THREE.Vector2();
const tempPoiScreenPosition = new THREE.Vector2();

const tempTransform = new THREE.Matrix4();
const tempTextBounds = new Math2D.Box();
const tempOffset = new THREE.Vector3();

const tempTextRect = { x: Infinity, y: Infinity, width: -Infinity, height: -Infinity };
const tempTextLabelBounds = new THREE.Box2();
const tempV3 = new THREE.Vector3(0, 0, 0);
const tempV4 = new THREE.Vector4();

const tempScreenBox: Math2D.Box = new Math2D.Box();

interface TextElementState {
    _worldParam?: number;
    _index?: number;
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

        // Render the user POIs first
        renderList.forEach(renderListEntry => {
            for (const tile of renderListEntry.visibleTiles) {
                for (const textElement of tile.userTextElements) {
                    // update distance
                    textElement.tileCenterX = tile.center.x;
                    textElement.tileCenterY = tile.center.y;
                    this.updateViewDistance(worldCenter, textElement);
                }

                this.renderTextElements(tile.userTextElements, time, frameNumber, textCache);
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

        if (this.m_lastRenderedTextElements.length === 0) {
            // Nothing has been rendered before, process the list of placed labels in all tiles.
            renderList.forEach(renderListEntry => {
                this.renderTileList(
                    renderListEntry.renderedTiles,
                    time,
                    frameNumber,
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
            this.renderTextElements(allRenderableTextElements, time, frameNumber, textCache);
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

    private renderOverlayTextElements(textElements: TextElement[]) {
        if (this.m_textRenderer === undefined) {
            return;
        }

        const screenXOrigin = (-window.innerWidth * window.devicePixelRatio) / 2.0;
        const screenYOrigin = (window.innerHeight * window.devicePixelRatio) / 2.0;
        const textOpacity = 1;

        for (const textElement of textElements) {
            const textRendererBuffer = this.m_textRenderer.getTextRendererBufferForStyle(
                textElement.style
            );

            if (textRendererBuffer === undefined) {
                break;
            }

            const style = textRendererBuffer.textStyle;
            const fontCatalog = style.fontCatalog;
            const buffer = textRendererBuffer.textBuffer;
            const textState = textElement as TextElementState;
            const points = textElement.path();

            const smallCaps = style.smallCaps === true;
            const allCaps = style.allCaps === true || smallCaps;
            const codepoints = textElement.getCodePoints(allCaps);
            const convertedToUpperCase = textElement.convertedToUpperCase;
            const textLength = codepoints.length;

            const bold =
                textElement.bold !== undefined
                    ? textElement.bold
                    : textRendererBuffer.textStyle.bold === true;
            const oblique =
                textElement.oblique !== undefined
                    ? textElement.oblique
                    : textRendererBuffer.textStyle.oblique === true;
            const bgMode =
                textRendererBuffer.textStyle.bgMode === TextBackgroundModeStrings.Glow
                    ? TextBackgroundMode.Glow
                    : TextBackgroundMode.Outline;

            const tracking =
                textElement.tracking !== undefined
                    ? textElement.tracking
                    : textRendererBuffer.textStyle.tracking !== undefined
                        ? textRendererBuffer.textStyle.tracking
                        : 0.0;

            if (
                buffer === undefined ||
                !buffer.canAddElements(textLength) ||
                fontCatalog === undefined
            ) {
                break;
            }

            const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
                fontCatalog.name
            );
            if (glyphCache === undefined) {
                logger.error("FontCatalog not used by text renderer: " + fontCatalog.name);
                return;
            }

            if (!textElement.allGlyphsLoaded) {
                let allGlyphsLoaded = true;
                let textElementWidth = 0;
                for (let j = 0; j < textLength; ++j) {
                    const glyph = fontCatalog.getGlyph(codepoints[j], bold);
                    if (glyph === undefined) {
                        allGlyphsLoaded = false;
                        break;
                    }
                    this.m_firstGlyphLoaded = true;
                    textElementWidth += glyph.advanceX + tracking;
                }
                if (!allGlyphsLoaded) {
                    continue;
                }
                textElement.allGlyphsLoaded = true;
                textElement.textWidth = textElementWidth;
            }

            const isPointLabel = points === undefined || points.length <= 1;

            // Place overlay text on a point.
            const addPointLabel = (overlayTextElement: TextElement) => {
                const textScale = overlayTextElement.scale * devicePixelRatio;

                tempScreenPosition.x = screenXOrigin;
                tempScreenPosition.y = screenYOrigin;

                if (overlayTextElement.xOffset !== undefined) {
                    tempScreenPosition.x += overlayTextElement.xOffset * devicePixelRatio;
                }

                if (overlayTextElement.yOffset !== undefined) {
                    tempScreenPosition.y -= overlayTextElement.yOffset * devicePixelRatio;
                }

                tempOffset.x = tempScreenPosition.x;
                tempOffset.y = tempScreenPosition.y;

                if (textLength > 0) {
                    let color: THREE.Color | undefined = overlayTextElement.color;
                    if (color === undefined) {
                        color =
                            style.color !== undefined
                                ? ColorCache.instance.getColor(style.color)
                                : this.m_mapView.defaultTextColor;
                    }

                    tempTransform.makeScale(textScale, textScale, textScale);
                    for (let j = 0; j < textLength; ++j) {
                        const glyph = fontCatalog.getGlyph(codepoints[j], bold);
                        if (glyph === undefined) {
                            continue;
                        }
                        glyphCache.add(glyph.codepoint, bold);

                        const smallCapsScale =
                            convertedToUpperCase[j] && smallCaps
                                ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                                : 1.0;

                        tempTransform.setPosition(tempOffset);
                        buffer.addGlyph(
                            glyph,
                            color,
                            textOpacity,
                            0,
                            tempTransform,
                            tempCorners,
                            true,
                            textElement.verticalAlignment,
                            oblique,
                            smallCapsScale !== 1.0,
                            bgMode,
                            overlayTextElement
                        );
                        tempOffset.x += (glyph.advanceX + tracking) * smallCapsScale * textScale;
                    }
                }
            };

            if (isPointLabel) {
                addPointLabel(textElement);
            }

            // From here on: place text along a path
            if (points === undefined || points.length <= 1) {
                continue;
            }

            const scaleFactor = textElement.scale * devicePixelRatio;
            tempScale.set(scaleFactor, scaleFactor, scaleFactor);

            const screenPoints: THREE.Vector2[] = [];
            for (const pt of points) {
                const pX = screenXOrigin + pt.x;
                const pY = screenYOrigin - pt.y;
                screenPoints.push(new THREE.Vector2(pX, pY));
            }

            const path = new SimplePath();
            for (let i = 0; i < screenPoints.length - 1; ++i) {
                path.add(new SimpleLineCurve(screenPoints[i], screenPoints[i + 1]));
            }

            const pathLength = path.getLength();

            const textWidth = textElement.textWidth * scaleFactor;

            let worldIndex: number | undefined;
            let worldParam: number | undefined;

            if (textState._worldParam !== undefined && textState._index !== undefined) {
                worldIndex = textState._index;
                worldParam = textState._worldParam;
            } else {
                const screenParam = path.getParamAt(0.5);

                if (screenParam === null) {
                    continue;
                }

                worldIndex = screenParam.index;
                worldParam = screenParam.t * screenParam.t;
            }

            textState._worldParam = worldParam;
            textState._index = worldIndex;

            const lengths = path.getLengths();

            const l1 = lengths[THREE.Math.clamp(worldIndex, 0, lengths.length - 1)];
            const l2 = lengths[THREE.Math.clamp(worldIndex + 1, 0, lengths.length - 1)];

            let placementOffset = THREE.Math.clamp(
                l1 * (1 - worldParam) + l2 * worldParam,
                0.0,
                1.0
            );

            let tangent = path.getTangent(placementOffset / pathLength);

            const dir = tangent && tangent.x < 0 ? -1 : 1;
            if (dir < 0) {
                placementOffset += textWidth;
            }

            const distance = textElement.renderDistance;

            for (let i = 0; i < textLength; ++i) {
                const glyph = fontCatalog.getGlyph(codepoints[i], bold);
                if (glyph === undefined) {
                    continue;
                }
                glyphCache.add(glyph.codepoint, bold);

                const smallCapsScale =
                    convertedToUpperCase[i] && smallCaps
                        ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                        : 1.0;

                const t0 = placementOffset / pathLength;
                const t1 = t0 + (dir * (glyph.width * smallCapsScale * scaleFactor)) / pathLength;

                const p0 = path.getPoint(THREE.Math.clamp(t0, 0.0, 1.0));
                const p1 = path.getPoint(THREE.Math.clamp(t1, 0.0, 1.0));

                tangent = p1.sub(p0).normalize();
                p0.x += textElement.xOffset || 0.0;
                p0.y -= textElement.yOffset || 0.0;
                tempPosition.set(p0.x, p0.y, 0);

                tempTransformMatrix.set(
                    tangent.x,
                    -tangent.y,
                    0,
                    0,
                    tangent.y,
                    tangent.x,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    1
                );
                tempTransformMatrix.setPosition(tempPosition);
                tempTransformMatrix.scale(tempScale);

                FontCatalog.getGlyphCorners(
                    glyph,
                    tempTransformMatrix,
                    tempCorners,
                    true,
                    textElement.verticalAlignment,
                    oblique,
                    smallCapsScale !== 1.0
                );

                tempGlyphBox.setFromPoints(tempCorners);

                buffer.addGlyph(
                    glyph,
                    textElement.color || this.m_mapView.defaultTextColor,
                    textOpacity,
                    distance,
                    tempTransformMatrix,
                    tempCorners,
                    true,
                    textElement.verticalAlignment,
                    oblique,
                    smallCapsScale !== 1.0,
                    bgMode,
                    textElement
                );

                placementOffset += dir * (glyph.advanceX + tracking) * scaleFactor;
            }
        }
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

        renderList.forEach(tileList => {
            this.placeTextElements(
                tileList.dataSource,
                tileList.storageLevel,
                tileList.zoomLevel,
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
                        textElement.minZoomLevel !== undefined &&
                        zoomLevel < textElement.minZoomLevel
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

    private renderTextElements(
        textElements: TextElement[],
        time: number,
        frameNumber: number,
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
        let numScreenParamsFailed = 0;
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
        const cameraNear = this.m_mapView.camera.near;
        const cameraFar = this.m_mapView.camera.far;
        // Take the world position of the camera as the origin to compute the distance to the
        // tex elements.
        const worldCenter = this.m_mapView.worldCenter.clone().add(this.m_mapView.camera.position);

        // Keep track if we need to call another update() on MapView.
        let fadeAnimationRunning = false;

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

            const style = textRendererBuffer.textStyle;
            const fontCatalog = style.fontCatalog;
            const buffer = textRendererBuffer.textBuffer;
            const textState = textElement as TextElementState;
            const points = textElement.path();

            const smallCaps = style.smallCaps === true;
            const allCaps = style.allCaps === true || smallCaps;
            const codepoints = textElement.getCodePoints(allCaps);
            const convertedToUpperCase = textElement.convertedToUpperCase;
            const textLength = codepoints.length;

            const bold =
                textElement.bold !== undefined
                    ? textElement.bold
                    : textRendererBuffer.textStyle.bold === true;
            const oblique =
                textElement.oblique !== undefined
                    ? textElement.oblique
                    : textRendererBuffer.textStyle.oblique === true;
            const bgMode =
                textRendererBuffer.textStyle.bgMode === TextBackgroundModeStrings.Glow
                    ? TextBackgroundMode.Glow
                    : TextBackgroundMode.Outline;

            const tracking =
                textElement.tracking !== undefined
                    ? textElement.tracking
                    : textRendererBuffer.textStyle.tracking !== undefined
                        ? textRendererBuffer.textStyle.tracking
                        : 0.0;

            if (
                buffer === undefined ||
                !buffer.canAddElements(textLength) ||
                fontCatalog === undefined
            ) {
                break;
            }

            const glyphCache = this.m_textRenderer.getGlyphTextureCacheForFontCatalog(
                fontCatalog.name
            );
            if (glyphCache === undefined) {
                logger.error("FontCatalog not used by text renderer: " + fontCatalog.name);
                return -1;
            }

            if (!textElement.allGlyphsLoaded) {
                let allGlyphsLoaded = true;
                let textElementWidth = 0;
                for (let j = 0; j < textLength; ++j) {
                    const glyph = fontCatalog.getGlyph(codepoints[j], bold);
                    if (glyph === undefined) {
                        allGlyphsLoaded = false;
                        break;
                    }
                    this.m_firstGlyphLoaded = true;
                    textElementWidth += glyph.advanceX + tracking;
                }
                if (!allGlyphsLoaded) {
                    continue;
                }
                textElement.allGlyphsLoaded = true;
                textElement.textWidth = textElementWidth;
            }

            const isPointLabel = points === undefined;
            const isLineMarker = textElement.isLineMarker;

            // Place text on a point, with or without POI icon
            const addPointLabel = (
                poiTextElement: TextElement,
                iconRenderState: RenderState,
                textRenderState: RenderState | undefined,
                position: THREE.Vector3,
                screenPos: THREE.Vector2
            ): boolean => {
                let textScale = poiTextElement.scale * devicePixelRatio;
                let distanceScale = 1.0;

                tempScreenPosition3.x = tempPoiScreenPosition.x = screenPos.x;
                tempScreenPosition3.y = tempPoiScreenPosition.y = screenPos.y;

                if (poiTextElement.xOffset !== undefined) {
                    tempScreenPosition3.x += poiTextElement.xOffset * devicePixelRatio;
                }

                if (poiTextElement.yOffset !== undefined) {
                    tempScreenPosition3.y += poiTextElement.yOffset * devicePixelRatio;
                }

                // we need the exact distance now, not the one computed and cached during placement.
                const textDistance = worldCenter.distanceTo(position);

                if (textDistance !== undefined) {
                    const distance = textDistance;
                    const startScaleDistance = (cameraFar - cameraNear) * labelStartScaleDistance;

                    if (distance > startScaleDistance) {
                        distanceScale =
                            1.0 -
                            ((distance - startScaleDistance) / (cameraFar - startScaleDistance)) *
                                (1.0 - poiTextElement.distanceScale);
                        textScale *= distanceScale;
                    }

                    textElement.currentViewDistance = textDistance;
                }

                const poiInfo: PoiInfo | undefined = poiTextElement.poiInfo;

                let iconSpaceAvailable = true;
                // Check if there is need to check for screen space for the POI.
                // First check if icon is valid:
                if (poiInfo !== undefined && poiRenderer.prepareRender(poiInfo)) {
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
                        // continue and process text part
                    } else {
                        // If the POI is prepared and valid, but just not visible, try again next
                        // time.
                        if (
                            secondChanceTextElements !== undefined &&
                            secondChanceTextElements.length < numSecondChanceLabels
                        ) {
                            secondChanceTextElements.push(poiTextElement);
                        }

                        // Forced making it uncurrent
                        iconRenderState.lastFrameNumber = -1;

                        return false;
                    }
                    if (iconRenderState.isFading()) {
                        this.updateFading(iconRenderState, time);
                    }
                }

                const doRenderPoiText =
                    // do not render if the distance os too great and distance should not be ignored
                    (poiTextElement.ignoreDistance === true ||
                        (poiTextElement.currentViewDistance === undefined ||
                            poiTextElement.currentViewDistance < poiTextMaxDistance)) &&
                    // do not render text if poi cannot be rendered and is not optional
                    (poiInfo === undefined ||
                        poiInfo.isValid === true ||
                        poiInfo.iconIsOptional !== false);

                if (doRenderPoiText && textLength > 0) {
                    let penX = 0;

                    tempTextRect.x = Infinity;
                    tempTextRect.y = Infinity;
                    tempTextRect.width = -Infinity;
                    tempTextRect.height = -Infinity;

                    for (let j = 0; j < textLength; ++j) {
                        const glyph = fontCatalog.getGlyph(codepoints[j], bold);
                        if (glyph === undefined) {
                            continue;
                        }

                        const smallCapsScale =
                            convertedToUpperCase[j] && smallCaps
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

                        penX += (glyph.advanceX + tracking) * smallCapsScale;
                    }

                    const scaledTextWidth = tempTextRect.width * textScale;
                    const scaledTextHeight = tempTextRect.height * textScale;

                    tempTextBounds.x =
                        tempScreenPosition3.x - scaledTextWidth * textElement.horizontalAlignment;
                    tempTextBounds.y = tempScreenPosition3.y - scaledTextHeight;
                    tempTextBounds.w = scaledTextWidth;
                    tempTextBounds.h = scaledTextHeight * 2.0;

                    tempOffset.x = tempTextBounds.x;
                    tempOffset.y = tempTextBounds.y + scaledTextHeight;

                    // ### make the margin configurable
                    tempTextBounds.x -= 4 * textScale;
                    tempTextBounds.y -= 2 * textScale;
                    tempTextBounds.w += 8 * textScale;
                    tempTextBounds.h += 4 * textScale;

                    // text visibility is requried, otherwise it is outside of the screen
                    if (!this.m_screenCollisions.isVisible(tempTextBounds)) {
                        if (
                            secondChanceTextElements !== undefined &&
                            secondChanceTextElements.length < numSecondChanceLabels
                        ) {
                            secondChanceTextElements.push(poiTextElement);
                        }
                        numPoiTextsInvisible++;
                        return false;
                    }

                    const textIsOptional: boolean =
                        poiTextElement.poiInfo !== undefined &&
                        poiTextElement.poiInfo.textIsOptional === true;

                    const textIsFadingIn =
                        textRenderState !== undefined && textRenderState.isFadingIn();
                    const textIsFadingOut =
                        textRenderState !== undefined && textRenderState.isFadingOut();
                    const textSpaceAvailable = !this.m_screenCollisions.isAllocated(tempTextBounds);
                    const textVisible =
                        poiTextElement.textMayOverlap ||
                        textSpaceAvailable ||
                        textIsFadingIn ||
                        textIsFadingOut;

                    if (textVisible) {
                        if (
                            DEBUG_TEXT_LAYOUT &&
                            this.m_debugPositions !== undefined &&
                            this.m_debugIndex !== undefined
                        ) {
                            const baseVertex = this.m_positionCount;

                            this.m_debugPositions.setXY(
                                this.m_positionCount++,
                                tempTextBounds.x,
                                tempTextBounds.y
                            );
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

                        if (!textIsFadingOut && poiTextElement.textReservesSpace) {
                            this.m_screenCollisions.allocate(tempTextBounds);
                        }

                        // Do not actually render (just allocate space) if camera is moving and
                        // renderTextDuringMovements is not true
                        if (
                            (textIsFadingIn ||
                                textIsFadingOut ||
                                !cameraIsMoving ||
                                (poiInfo === undefined ||
                                    poiInfo.renderTextDuringMovements === true)) &&
                            !iconRenderState.isFadedOut()
                        ) {
                            let color: THREE.Color | undefined = poiTextElement.color;
                            if (color === undefined) {
                                color =
                                    style.color !== undefined
                                        ? ColorCache.instance.getColor(style.color)
                                        : this.m_mapView.defaultTextColor;
                            }

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

                            const distance = poiTextElement.renderDistance;

                            tempTransform.makeScale(textScale, textScale, textScale);
                            for (let j = 0; j < textLength; ++j) {
                                const glyph = fontCatalog.getGlyph(codepoints[j], bold);
                                if (glyph === undefined) {
                                    continue;
                                }
                                glyphCache.add(glyph.codepoint, bold);

                                const smallCapsScale =
                                    convertedToUpperCase[j] && smallCaps
                                        ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                                        : 1.0;

                                tempTransform.setPosition(tempOffset);
                                buffer.addGlyph(
                                    glyph,
                                    color,
                                    opacity,
                                    distance,
                                    tempTransform,
                                    tempCorners,
                                    true,
                                    textElement.verticalAlignment,
                                    oblique,
                                    smallCapsScale !== 1.0,
                                    bgMode,
                                    poiTextElement
                                );
                                tempOffset.x +=
                                    (glyph.advanceX + tracking) * smallCapsScale * textScale;
                            }

                            if (textRenderState !== undefined) {
                                textRenderState.lastFrameNumber = frameNumber;
                            }
                        }
                        numRenderedPoiTexts++;
                    } else {
                        // if the text part is not optional, we also do not render the icon
                        if (!textIsOptional) {
                            if (
                                poiTextElement.poiInfo === undefined ||
                                iconRenderState.isVisible()
                            ) {
                                if (poiTextElement.poiInfo !== undefined) {
                                    this.startFadeOut(iconRenderState, frameNumber, time);
                                }
                                if (textRenderState !== undefined && textRenderState.isVisible()) {
                                    const iconStartedFadeOut = this.checkStartFadeOut(
                                        textRenderState,
                                        frameNumber,
                                        time
                                    );
                                    fadeAnimationRunning =
                                        fadeAnimationRunning || iconStartedFadeOut;
                                }
                            } else {
                                if (
                                    secondChanceTextElements !== undefined &&
                                    secondChanceTextElements.length < numSecondChanceLabels
                                ) {
                                    secondChanceTextElements.push(poiTextElement);
                                }
                                numPoiTextsInvisible++;
                                return false;
                            }
                        } else {
                            // if the label is currently visible, we fade it out
                            if (textRenderState !== undefined && textRenderState.isVisible()) {
                                const iconStartedFadeOut = this.checkStartFadeOut(
                                    textRenderState,
                                    frameNumber,
                                    time
                                );
                                fadeAnimationRunning = fadeAnimationRunning || iconStartedFadeOut;
                            }
                        }
                    }
                }

                if (poiInfo !== undefined) {
                    if (poiRenderer.poiIsRenderable(poiInfo)) {
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
                            iconRenderState.opacity
                        );

                        iconRenderState.lastFrameNumber = frameNumber;

                        numRenderedPoiIcons++;
                    }
                }

                numRenderedTextElements++;

                if (renderedTextElements !== undefined) {
                    renderedTextElements.push(poiTextElement);
                }

                return true;
            };

            if (isPointLabel) {
                tempPosition2.x = textElement.position.x + textElement.tileCenterX!;
                tempPosition2.y = textElement.position.y + textElement.tileCenterY!;
                tempPosition2.z = 0;

                if (
                    this.m_screenProjector.project(tempPosition2, tempScreenPosition2) !== undefined
                ) {
                    if (textElement.iconRenderState === undefined) {
                        textElement.iconRenderState = new RenderState();
                        this.startFadeIn(textElement.iconRenderState, frameNumber, time);

                        // The text part fades in/out independently, so we need a second renderState
                        // for the text.
                        textElement.textRenderState = new RenderState();
                        this.startFadeIn(textElement.textRenderState, frameNumber, time);
                    }
                    addPointLabel(
                        textElement,
                        textElement.iconRenderState!,
                        textElement.textRenderState!,
                        tempPosition2,
                        tempScreenPosition2
                    );
                }

                // Done here, get next TextElement.
                continue;
            } else if (isLineMarker) {
                const poiInfo = textElement.poiInfo!;

                if (
                    points === undefined ||
                    points.length === 0 ||
                    !poiRenderer.prepareRender(poiInfo)
                ) {
                    continue;
                }

                const lineTechnique = poiInfo.technique as LineMarkerTechnique;

                const minDistanceSqr =
                    lineTechnique.minDistance !== undefined
                        ? lineTechnique.minDistance * lineTechnique.minDistance
                        : 0;

                let shieldGroup: number[] | undefined;

                if (poiInfo.shieldGroupIndex !== undefined) {
                    shieldGroup = shieldGroups[poiInfo.shieldGroupIndex];
                    if (shieldGroup === undefined) {
                        shieldGroup = [];
                        shieldGroups[poiInfo.shieldGroupIndex] = shieldGroup;
                    }
                }

                if (textElement.iconRenderStates === undefined) {
                    // Create a unique renderState for every individual point of the lineMarker
                    const renderStates = new Array<RenderState>();
                    points.forEach(() => {
                        const renderState = new RenderState();
                        renderState.state = FadingState.FadingIn;
                        renderStates.push(renderState);
                    });
                    textElement.iconRenderStates = renderStates;
                }

                if (minDistanceSqr > 0 && shieldGroup !== undefined) {
                    for (let i = 0; i < points.length; i++) {
                        const point = points[i];
                        // Check if there is enough space in the buffer left for one more line
                        // marker
                        if (!buffer.canAddElements(textLength)) {
                            break;
                        }
                        tempPosition2.x = point.x + textElement.tileCenterX!;
                        tempPosition2.y = point.y + textElement.tileCenterY!;
                        tempPosition2.z = 0;

                        if (
                            this.m_screenProjector.project(tempPosition2, tempScreenPosition) ===
                            undefined
                        ) {
                            continue;
                        }

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

                        if (!tooClose) {
                            // not too close to another point of same shieldGroup
                            if (
                                addPointLabel(
                                    textElement,
                                    textElement.iconRenderStates![i],
                                    undefined,
                                    tempPosition2,
                                    tempScreenPosition
                                )
                            ) {
                                shieldGroup.push(tempScreenPosition.x, tempScreenPosition.y);
                            }
                        }
                    }
                } else {
                    // check if there is enough space in the buffer left for all line markers
                    if (!buffer.canAddElements(points.length * textLength)) {
                        break;
                    }
                    for (let i = 0; i < points.length; i++) {
                        const point = points[i];
                        tempPosition2.x = point.x + textElement.tileCenterX!;
                        tempPosition2.y = point.y + textElement.tileCenterY!;
                        tempPosition2.z = 0;

                        if (
                            this.m_screenProjector.project(tempPosition2, tempScreenPosition) !==
                            undefined
                        ) {
                            addPointLabel(
                                textElement,
                                textElement.iconRenderStates![i],
                                undefined,
                                tempPosition2,
                                tempScreenPosition
                            );
                        }
                    }
                }
                // Done here, get next TextElement.
                continue;
            }

            // Proceed with placing text label along a path
            if (points === undefined || points.length === 0) {
                continue;
            }

            // Limit the text rendering in the far distance
            const doRenderText =
                textElement.ignoreDistance === true ||
                textElement.currentViewDistance === undefined ||
                textElement.currentViewDistance < textMaxDistance;

            if (!doRenderText) {
                continue;
            }

            const scaleFactor = textElement.scale * devicePixelRatio;

            tempScale.set(scaleFactor, scaleFactor, scaleFactor);

            // TODO: optimize array allocations
            const screenPoints: THREE.Vector2[] = [];

            let clipped = false;

            // TODO: use temporary
            const firstPoint = points[0].clone();

            const tileCenterX = textElement.tileCenterX!;
            const tileCenterY = textElement.tileCenterY!;

            firstPoint.x += tileCenterX;
            firstPoint.y += tileCenterY;

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
                    continue;
                }
                cacheEntry.push(firstPoint);
            }

            for (const pt of points) {
                tempWorldPos.set(pt.x + tileCenterX, pt.y + tileCenterY, 0);

                const screenPoint = this.m_screenProjector.project(tempWorldPos);

                if (screenPoint === undefined) {
                    clipped = true;
                    break;
                }

                screenPoints.push(screenPoint);
            }

            if (clipped) {
                continue;
            }

            const indexOfFirstVisibleScreenPoint = screenPoints.findIndex(p2 => {
                if (this.m_screenCollisions.screenBounds.contains(p2.x, p2.y)) {
                    return true;
                }
                return false;
            });

            if (indexOfFirstVisibleScreenPoint === -1) {
                numNotVisible++;
                continue;
            }

            const path = new SimplePath();

            for (let i = 0; i < screenPoints.length - 1; ++i) {
                path.add(new SimpleLineCurve(screenPoints[i], screenPoints[i + 1]));
            }

            const pathLength = path.getLength();

            const textWidth = textElement.textWidth * scaleFactor;

            if (textWidth > pathLength) {
                numPlacementIssue4++;
                continue;
            }

            let percent = 0.5;

            let worldIndex: number | undefined;
            let worldParam: number | undefined;

            if (textState._worldParam !== undefined && textState._index !== undefined) {
                worldIndex = textState._index;
                worldParam = textState._worldParam;

                tempV4.set(
                    points[worldIndex].x + tileCenterX,
                    points[worldIndex].y + tileCenterY,
                    0,
                    1
                );
                this.m_screenProjector.projectVector(tempV4);

                const w1 = tempV4.w;

                tempV4.set(
                    points[worldIndex + 1].x + tileCenterX,
                    points[worldIndex + 1].y + tileCenterY,
                    0,
                    1
                );
                this.m_screenProjector.projectVector(tempV4);

                const w2 = tempV4.w;

                percent = (worldParam * w2) / (w1 + (w2 - w1) / worldParam);
            } else {
                const screenParam = path.getParamAt(percent);

                if (screenParam === null) {
                    numScreenParamsFailed++;
                    continue;
                }

                worldIndex = screenParam.index;

                tempV4.set(
                    points[screenParam.index].x + tileCenterX,
                    points[screenParam.index].y + tileCenterY,
                    0,
                    1
                );
                this.m_screenProjector.projectVector(tempV4);

                const w1 = tempV4.w;

                tempV4.set(
                    points[screenParam.index + 1].x + tileCenterX,
                    points[screenParam.index + 1].y + tileCenterY,
                    0,
                    1
                );
                this.m_screenProjector.projectVector(tempV4);

                const w2 = tempV4.w;

                worldParam = (screenParam.t * w1) / (w2 + (w1 - w2) / screenParam.t);
            }

            textState._worldParam = worldParam;
            textState._index = worldIndex;

            const lengths = path.getLengths();

            const l1 = lengths[THREE.Math.clamp(worldIndex, 0, lengths.length - 1)];
            const l2 = lengths[THREE.Math.clamp(worldIndex + 1, 0, lengths.length - 1)];

            let placementOffset = l1 * (1 - worldParam) + l2 * worldParam;

            if (placementOffset > pathLength) {
                numPlacementIssue1++;
                continue;
            }

            let shouldDraw = true;
            let isJustNotVisible = false;

            let previousTangent: THREE.Vector2 | undefined;

            const state = buffer.saveState();

            tempTextLabelBounds.makeEmpty();

            let tangent = path.getTangent(placementOffset / pathLength);

            const dir = tangent && tangent.x < 0 ? -1 : 1;

            if (dir < 0) {
                placementOffset += textWidth;
            }

            let roadTextOpacity = 1.0;

            if (textElement.textRenderState === undefined) {
                textElement.textRenderState = new RenderState();
            }

            const pathTextRenderState = textElement.textRenderState;
            // Fade-in after skipping rendering during movement
            if (
                pathTextRenderState.state === FadingState.Undefined ||
                pathTextRenderState.lastFrameNumber < frameNumber - 1
            ) {
                this.startFadeIn(pathTextRenderState, frameNumber, time);
            }

            const startedFadeIn = this.checkStartFadeIn(pathTextRenderState, frameNumber, time);
            fadeAnimationRunning = fadeAnimationRunning || startedFadeIn;

            if (pathTextRenderState.isFading()) {
                roadTextOpacity = pathTextRenderState.opacity;
            }

            // it is expensive to transform all glyphs back to 3D to get the correct depth, so the
            // current distance used for sorting is applied here.
            const textRenderDistance = textElement.renderDistance;

            for (let i = 0; i < textLength; ++i) {
                const glyph = fontCatalog.getGlyph(codepoints[i], bold);
                if (glyph === undefined) {
                    continue;
                }
                glyphCache.add(glyph.codepoint, bold);

                const smallCapsScale =
                    convertedToUpperCase[i] && smallCaps
                        ? glyph.metrics.xHeight! / glyph.metrics.capHeight!
                        : 1.0;

                const t0 = placementOffset / pathLength;
                const t1 = t0 + (dir * (glyph.width * smallCapsScale * scaleFactor)) / pathLength;

                if (t0 < 0 || t0 > 1 || t1 < 0 || t1 > 1) {
                    shouldDraw = false;
                    numPlacementIssue2++;
                    continue;
                }

                const p0 = path.getPoint(t0);
                const p1 = path.getPoint(t1);

                tangent = p1.sub(p0).normalize();

                if (previousTangent !== undefined) {
                    const theta = Math.atan2(
                        previousTangent.x * tangent.y - tangent.x * previousTangent.y,
                        tangent.dot(previousTangent)
                    );

                    if (Math.abs(theta) > Math.PI / 8) {
                        shouldDraw = false;
                        numPlacementIssue3++;
                        break;
                    }
                }

                previousTangent = tangent;

                tempRotationMatrix.set(
                    tangent.x,
                    -tangent.y,
                    0,
                    0,
                    tangent.y,
                    tangent.x,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    1
                );

                p0.x += textElement.xOffset || 0.0;
                p0.y -= textElement.yOffset || 0.0;

                translationMatrix.makeTranslation(p0.x, p0.y, 0);

                tempTransformMatrix
                    .multiplyMatrices(translationMatrix, tempRotationMatrix)
                    .scale(tempScale);

                FontCatalog.getGlyphCorners(
                    glyph,
                    tempTransformMatrix,
                    tempCorners,
                    true,
                    textElement.verticalAlignment,
                    oblique,
                    smallCapsScale !== 1.0
                );

                tempGlyphBox.setFromPoints(tempCorners);

                ScreenCollisions.toBox2D(tempGlyphBox, tempGlyphBox2D);

                if (
                    !this.m_screenCollisions.isVisible(tempGlyphBox2D) ||
                    (!textElement.textMayOverlap &&
                        this.m_screenCollisions.isAllocated(tempGlyphBox2D))
                ) {
                    shouldDraw = false;
                    isJustNotVisible = true;
                    numNotVisible++;
                    break;
                }

                tempTextLabelBounds.union(tempGlyphBox);

                if (
                    !buffer.addGlyph(
                        glyph,
                        textElement.color || this.m_mapView.defaultTextColor,
                        roadTextOpacity,
                        textRenderDistance,
                        tempTransformMatrix,
                        tempCorners,
                        true,
                        textElement.verticalAlignment,
                        oblique,
                        smallCapsScale !== 1.0,
                        bgMode,
                        textElement
                    )
                ) {
                    shouldDraw = false;
                    numCannotAdd++;
                    break;
                }
                placementOffset += dir * (glyph.advanceX + tracking) * smallCapsScale * scaleFactor;
            }

            if (!shouldDraw) {
                // textState._worldParam = undefined;
                // textState._index = undefined;
                buffer.restoreState(state);

                if (
                    isJustNotVisible &&
                    secondChanceTextElements !== undefined &&
                    secondChanceTextElements.length < this.m_numSecondChanceLabels!
                ) {
                    secondChanceTextElements.push(textElement);
                }
                continue;
            }

            if (textElement.textReservesSpace) {
                ScreenCollisions.toBox2D(tempTextLabelBounds, tempGlyphBox2D);
                this.m_screenCollisions.allocate(tempGlyphBox2D);
            }

            if (renderedTextElements !== undefined) {
                renderedTextElements.push(textElement);
            }

            numRenderedTextElements++;

            if (
                DEBUG_TEXT_LAYOUT &&
                this.m_debugPositions !== undefined &&
                this.m_debugIndex !== undefined
            ) {
                const baseVertex = this.m_positionCount;

                this.m_debugPositions.setXY(
                    this.m_positionCount++,
                    tempTextLabelBounds.min.x,
                    tempTextLabelBounds.min.y
                );
                this.m_debugPositions.setXY(
                    this.m_positionCount++,
                    tempTextLabelBounds.max.x,
                    tempTextLabelBounds.min.y
                );
                this.m_debugPositions.setXY(
                    this.m_positionCount++,
                    tempTextLabelBounds.min.x,
                    tempTextLabelBounds.max.y
                );
                this.m_debugPositions.setXY(
                    this.m_positionCount++,
                    tempTextLabelBounds.max.x,
                    tempTextLabelBounds.max.y
                );

                this.m_debugIndex.setX(this.m_indexCount++, baseVertex);
                this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 1);
                this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 2);
                this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 2);
                this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 1);
                this.m_debugIndex.setX(this.m_indexCount++, baseVertex + 3);
            }
        }

        if (PRINT_LABEL_DEBUG_INFO && printInfo) {
            logger.log("textElements.length", textElements.length);
            logger.log("numRenderedTextElements", numRenderedTextElements);
            logger.log("numRenderedPoiIcons", numRenderedPoiIcons);
            logger.log("numRenderedPoiTexts", numRenderedPoiTexts);
            logger.log("numPoiTextsInvisible", numPoiTextsInvisible);
            logger.log("numNotVisible", numNotVisible);
            logger.log("numScreenParamsFailed", numScreenParamsFailed);
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
                textCache,
                renderedTextElements,
                secondChanceTextElements
            );

            if (numRenderedTextElements > maxNumRenderedTextElements) {
                break;
            }
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
