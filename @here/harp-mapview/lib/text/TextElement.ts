/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ImageTexture,
    isLineMarkerTechnique,
    LineMarkerTechnique,
    PoiStackMode,
    PoiTechnique
} from "@here/harp-datasource-protocol";
import {
    GlyphData,
    TextBufferObject,
    TextLayoutParameters,
    TextLayoutStyle,
    TextRenderParameters,
    TextRenderStyle
} from "@here/harp-text-canvas";
import { Math2D, MathUtils } from "@here/harp-utils";

import * as THREE from "three";

import { ImageItem } from "../image/Image";
import { PickResult } from "../PickHandler";

/**
 * Additional information for an icon that is to be rendered along with a [[TextElement]].
 */
export interface PoiInfo {
    /**
     * Technique defining the POI or LineMarker
     */
    technique: PoiTechnique | LineMarkerTechnique;

    /**
     * Name of the [[ImageTexture]].
     */
    imageTextureName: string;

    /**
     * Name of the POI table [[PoiTable]].
     */
    poiTableName?: string;

    /**
     * Name of the POI description in the [[PoiTable]].
     */
    poiName?: string;

    /**
     * Specify stack mode. Defaults to `ShowInStack`.
     */
    stackMode?: PoiStackMode;

    /**
     * Minimum zoomLevel at which to display the label icon. No default.
     */
    iconMinZoomLevel?: number;

    /**
     * Maximum zoomLevel at which to display the label icon. No default.
     */
    iconMaxZoomLevel?: number;

    /**
     * Minimum zoomLevel at which to display the label text. No default.
     */
    textMinZoomLevel?: number;

    /**
     * Maximum zoomLevel at which to display the label text. No default.
     */
    textMaxZoomLevel?: number;

    /**
     * If true, the text icon will appear even if the text part is blocked by other labels. Defaults
     * to `false`.
     */
    textIsOptional?: boolean;

    /**
     * If true, the text will appear even if the icon cannot be rendered because of missing icon
     * graphics. Defaults to `true`.
     */
    iconIsOptional?: boolean;

    /**
     * If `true`, icon is allowed to overlap other labels or icons of lower priority.
     */
    mayOverlap?: boolean;

    /**
     * If `true`, icon will reserve screen space, other markers of lower priority will not be
     * able to overlap.
     */
    reserveSpace?: boolean;

    /**
     * If isValid is `false`, the icon will no longer be placed or rendered. The reason may be a
     * missing resource.
     */
    isValid?: boolean;

    /**
     * ID to identify the (POI) icon.
     */
    featureId?: number;

    /**
     * Reference back to owning [[TextElement]].
     */
    textElement: TextElement;

    /**
     * @hidden
     * If false, text will not be rendered during camera movements. Defaults to `true`;
     */
    renderTextDuringMovements?: boolean;

    /**
     * @hidden
     * Direct access to [[ImageItem]] once it is resolved.
     */
    imageItem?: ImageItem;

    /**
     * @hidden
     * Direct access to [[ImageTexture]] once it is resolved.
     */
    imageTexture?: ImageTexture;

    /**
     * @hidden
     * Layout help: A shield group is for all [[LineMarker]]s that have the same icon and text,
     * making them the same road shield icon.
     */
    shieldGroupIndex?: number;

    /**
     * @hidden
     * Internal reference to a render batch, made up of all icons that use the same Material.
     */
    poiRenderBatch?: number;

    /**
     * @hidden
     * Should be computed during loading/initializing of `ImageTexture`.
     */
    computedWidth?: number;

    /**
     * @hidden
     * Should be computed during loading/initializing of `ImageTexture`.
     */
    computedHeight?: number;

    /**
     * @hidden
     * Should be computed during loading/initializing of `ImageTexture`.
     */
    uvBox?: Math2D.UvBox;

    /**
     * @hidden
     * Computed from owning [[TextElement]]. Value is set when `PoiInfo` is assigned to
     * [[TextElement]].
     */
    renderOrder?: number;
}

export interface TextPickResult extends PickResult {
    /**
     * Text of the picked [[TextElement]]
     */
    text?: string;
}

/**
 * State of fading.
 */
export enum FadingState {
    Undefined = 0,
    FadingIn = 1,
    FadedIn = 2,
    FadingOut = -1,
    FadedOut = -2
}

/**
 * State of loading.
 */
export enum LoadingState {
    Requested,
    Loaded,
    Initialized
}

/**
 * Time to fade in/fade out the labels in milliseconds.
 */
export const DEFAULT_FADE_TIME = 800;

/**
 * State of rendering of the icon and text part of the `TextElement`. Mainly for fading the elements
 * in and out, to compute the opacity.
 *
 * @hidden
 */
export class RenderState {
    /**
     * Create a `RenderState`.
     *
     * @param state Fading state.
     * @param value Current fading value [0..1].
     * @param startTime Time stamp the fading started.
     * @param opacity Computed opacity depending on value.
     * @param lastFrameNumber Latest frame the elements was rendered, allows to detect some less
     *                        obvious states, like popping up after being hidden.
     * @param fadingTime Time used to fade in or out.
     */
    constructor(
        public state = FadingState.Undefined,
        public value = 0.0,
        public startTime = 0,
        public opacity = 1.0,
        public lastFrameNumber = Number.MIN_SAFE_INTEGER,
        public fadingTime: number = DEFAULT_FADE_TIME
    ) {}

    /**
     * Reset existing `RenderState` to appear like a fresh state.
     */
    reset() {
        this.state = FadingState.Undefined;
        this.value = 0.0;
        this.startTime = 0.0;
        this.opacity = 1.0;
        this.lastFrameNumber = Number.MIN_SAFE_INTEGER;
    }

    /**
     * @returns `true` if element is either fading in or fading out.
     */
    isFading(): boolean {
        const fading = this.state === FadingState.FadingIn || this.state === FadingState.FadingOut;
        return fading;
    }

    /**
     * @returns `true` if element is fading in.
     */
    isFadingIn(): boolean {
        const fadingIn = this.state === FadingState.FadingIn;
        return fadingIn;
    }

    /**
     * @returns `true` if element is fading out.
     */
    isFadingOut(): boolean {
        const fadingOut = this.state === FadingState.FadingOut;
        return fadingOut;
    }

    /**
     * @returns `true` if element is done with fading in.
     */
    isFadedIn(): boolean {
        const fadedIn = this.state === FadingState.FadedIn;
        return fadedIn;
    }

    /**
     * @returns `true` if element is done with fading out.
     */
    isFadedOut(): boolean {
        const fadedOut = this.state === FadingState.FadedOut;
        return fadedOut;
    }

    /**
     * @returns `true` if element is either faded in, is fading in or is fading out.
     */
    isVisible(): boolean {
        const visible =
            this.state === FadingState.FadingIn ||
            this.state === FadingState.FadedIn ||
            this.state === FadingState.FadingOut;
        return visible;
    }
}

/**
 * `TextElement` is used to create 2D text elements (for example, labels).
 */
export class TextElement {
    /**
     * Determines visibility. If set to `false`, it will not be rendered.
     */
    visible: boolean = true;

    /**
     * Determines minimum zoom level for visibility. Can be used to reduce the number of visible
     * `TextElement`s based on zoom level.
     */
    minZoomLevel?: number;
    /**
     * Determines maximum zoom level for visibility. Can be used to reduce the number of visible
     * `TextElement`s based on zoom level.
     */
    maxZoomLevel?: number;

    /**
     * If `true`, label is allowed to overlap other labels or icons of lower priority.
     * @default `false`
     */
    mayOverlap?: boolean;

    /**
     * If `true`, label will reserve screen space, other markers of lower priority will not be
     * able to overlap.
     * @default `true`
     */
    reserveSpace?: boolean;

    /**
     * If `true`, the label will always be rendered on top. If overlapping with other labels, the
     * render order is undefined;
     * @default `false`
     */
    alwaysOnTop?: boolean;

    /**
     * Ignore distance limit. Used for label in labeled-icons.
     */
    ignoreDistance?: boolean;

    /**
     * Scaling factor of text. Defaults to 0.5, reducing the size ot 50% in the distance.
     */
    distanceScale: number = 0.5;

    /**
     * Optional user data. Will be retrieved during picking.
     */
    userData?: any;

    /**
     * If specified, determines the render order between `TextElement`s. The number different
     * renderOrders should be as small as possible, because every specific `renderOrder` may result
     * in one or more draw calls.
     *
     * TextElements with the same integer `renderOrder` will be rendered in the same batch.
     *
     * The `renderOrder` of `TextElement`s are only relative to other `TextElement`s, and not other
     * map elements.
     *
     * A `TextElement` with a higher `renderOrder` will be rendered after a `TextElement` with a
     * lower `renderOrder`.
     */
    renderOrder?: number = 0;

    /**
     * @hidden
     * Used during label placement for optimization.
     */
    tileCenterX?: number;

    /**
     * @hidden
     * Used during label placement for optimization.
     */
    tileCenterY?: number;

    /**
     * @hidden
     * Used during label placement to reserve space from front to back.
     */
    currentViewDistance?: number;

    /**
     * @hidden
     * Used during sorting.
     */
    sortPriority?: number = 0;

    /**
     * @hidden
     * Used during rendering.
     */
    loadingState?: LoadingState;

    /**
     * @hidden
     * Used during rendering.
     */
    iconRenderState?: RenderState;

    /**
     * @hidden
     * Used during rendering.
     */
    textRenderState?: RenderState;

    /**
     * @hidden
     * Used during rendering. Used for line markers only, which have a points array and mltiple
     * icon positions to render. Since line markers use the same renderState for text part and icon,
     * there is no separate array of [[RenderState]]s for the text parts of the line markers.
     */
    iconRenderStates?: RenderState[];

    /**
     * @hidden
     * Text rendering style.
     */
    renderStyle?: TextRenderStyle;

    /**
     * @hidden
     * Text rendering style.
     */
    layoutStyle?: TextLayoutStyle;

    /**
     * @hidden
     * Array storing the style [[GlyphData]] for this `TextElement` to speed up label placement in
     * [[TextElementsRenderer]]. Valid after `loadingState` is `Initialized`.
     */
    glyphs?: GlyphData[];

    /**
     * @hidden
     * Array storing the casing (`true`: uppercase, `false`: lowercase) for this `TextElement`.
     * Used by labels in [[TextElementsRenderer]] to support `SmallCaps`. Valid after `loadingState`
     * is `Initialized`.
     */
    glyphCaseArray?: boolean[];

    /**
     * Screen space bounds for this `TextElement`. Used by point labels in [[TextElementsRenderer]].
     * Valid after `loadingState` is `Initialized`.
     */
    bounds?: THREE.Box2;

    /**
     * @hidden
     * Pre-computed text vertex buffer. Used by point labels in [[TextElementsRenderer]]. Valid
     * after label becomes visible for the first time.
     */
    textBufferObject?: TextBufferObject;

    /**
     * @hidden
     * If `true`, the estimated bounding box of the path is too small for the label to fit, so it is
     * being ignored for rendering in the latest frame.
     */
    dbgPathTooSmall?: boolean;

    private m_poiInfo?: PoiInfo;

    /**
     * Creates a new `TextElement`.
     *
     * @param text The text to display.
     * @param points The position in world coordinates or a list of points in world coordinates for
     *              a curved text.
     * @param renderParams `TextElement` text rendering parameters.
     * @param layoutParams `TextElement` text layout parameters.
     * @param priority The priority of the `TextElement. Elements with the highest priority get
     *              placed first, elements with priority of `0` are placed last, elements with a
     *              negative value are always rendered, ignoring priorities and allowing
     *              overrides.
     * @param xOffset Optional X offset of this `TextElement` in screen coordinates.
     * @param yOffset Optional Y offset of this `TextElement` in screen coordinates.
     * @param featureId Optional number to identify feature (originated from `OmvDataSource`).
     * @param fadeNear Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the
     *              label starts fading out (opacity decreases).
     * @param fadeFar Distance to the camera (0.0 = camera position, 1.0 = farPlane) at which the
     *              label becomes transparent. A value of <= 0.0 disables fading.
     */
    constructor(
        readonly text: string,
        readonly points: THREE.Vector2[] | THREE.Vector2 | THREE.Vector3,
        readonly renderParams: TextRenderParameters | TextRenderStyle,
        readonly layoutParams: TextLayoutParameters | TextLayoutStyle,
        public priority = 0,
        public xOffset?: number,
        public yOffset?: number,
        public featureId?: number,
        public style?: string,
        public fadeNear?: number,
        public fadeFar?: number
    ) {
        if (renderParams instanceof TextRenderStyle) {
            this.renderStyle = renderParams;
        }
        if (layoutParams instanceof TextLayoutStyle) {
            this.layoutStyle = layoutParams;
        }
    }

    /**
     * The position of this text element in world coordinates or the first point of the path used to
     * render a curved text.
     */
    get position(): THREE.Vector2 {
        if (this.points instanceof Array) {
            return this.points[0];
        }
        if (this.points instanceof THREE.Vector3) {
            return new THREE.Vector2(this.points.x, this.points.y);
        }
        return this.points;
    }

    /**
     * The position of this text element in world coordinates or the first point of the path used to
     * render a curved text.
     */
    get position3(): THREE.Vector3 {
        if (this.points instanceof THREE.Vector3) {
            return this.points as THREE.Vector3;
        }
        if (this.points instanceof Array) {
            return new THREE.Vector3(this.points[0].x, this.points[0].y, 0);
        }
        return new THREE.Vector3(this.points.x, this.points.y, 0);
    }

    /**
     * The list of points in world coordinates used to render the text along a path or `undefined`.
     */
    get path(): THREE.Vector2[] | undefined {
        if (this.points instanceof Array) {
            return this.points;
        }
        return undefined;
    }

    /**
     * If `true`, `TextElement` is allowed to overlap other labels or icons of lower priority.
     *
     * @default `false`
     */
    get textMayOverlap(): boolean {
        return this.mayOverlap === true;
    }

    set textMayOverlap(mayOverlap: boolean) {
        this.mayOverlap = mayOverlap;
    }

    /**
     * If `true`, `TextElement` will reserve screen space, other markers of lower priority will not
     * be able to overlap.
     *
     * @default `true`
     */
    get textReservesSpace(): boolean {
        return this.reserveSpace !== false;
    }

    set textReservesSpace(reserveSpace: boolean) {
        this.reserveSpace = reserveSpace;
    }

    /**
     * Determine if the `TextElement` is a line marker.
     *
     * @returns `true` if this `TextElement` is a line marker.
     */
    get isLineMarker(): boolean {
        return (
            this.points !== undefined &&
            (this.m_poiInfo !== undefined && isLineMarkerTechnique(this.m_poiInfo.technique))
        );
    }

    /**
     * Return the last distance that has been computed for sorting during placement. This may not be
     * the actual distance if the camera is moving, as the distance is computed only during
     * placement. If the property `alwaysOnTop` is true, the value returned is always `0`.
     *
     * @returns 0 or negative distance to camera.
     */
    get renderDistance(): number {
        return this.alwaysOnTop === true
            ? 0
            : this.currentViewDistance !== undefined
            ? -this.currentViewDistance
            : 0;
    }

    /**
     * Contains additional information about icon to be rendered along with text.
     */
    get poiInfo(): PoiInfo | undefined {
        return this.m_poiInfo;
    }

    set poiInfo(poiInfo: PoiInfo | undefined) {
        this.m_poiInfo = poiInfo;
        if (poiInfo !== undefined) {
            const poiRenderOrder = this.renderOrder !== undefined ? this.renderOrder : 0;
            poiInfo.renderOrder = poiRenderOrder;
        }
    }

    /**
     * Update the minZoomLevel and maxZoomLevel from the values set in [[PoiInfo]].
     * Selects the smaller/larger one of the two min/max values for icon and text, because the
     * TextElement is a container for both.
     */
    updateMinMaxZoomLevelsFromPoiInfo() {
        if (this.poiInfo !== undefined) {
            if (this.minZoomLevel === undefined) {
                this.minZoomLevel = MathUtils.min2(
                    this.poiInfo.iconMinZoomLevel,
                    this.poiInfo.textMinZoomLevel
                );
            }
            if (this.maxZoomLevel === undefined) {
                this.maxZoomLevel = MathUtils.max2(
                    this.poiInfo.iconMaxZoomLevel,
                    this.poiInfo.textMaxZoomLevel
                );
            }
        }
    }
}
