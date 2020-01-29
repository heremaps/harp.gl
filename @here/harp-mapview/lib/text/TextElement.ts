/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    GeometryKind,
    GeometryKindSet,
    ImageTexture,
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
import { TextElementType } from "./TextElementType";

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

/**
 * Return 'true' if the POI has been successfully prepared for rendering.
 *
 * @param poiInfo PoiInfo containing information for rendering the POI icon.
 */
export function poiIsRenderable(poiInfo: PoiInfo): boolean {
    return poiInfo.poiRenderBatch !== undefined;
}

export interface TextPickResult extends PickResult {
    /**
     * Text of the picked [[TextElement]]
     */
    text?: string;
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
     * Specified kind of geometry. One kind is set as default in the technique, and can be
     * overridden in the style.
     */
    kind?: GeometryKind | GeometryKindSet;

    /**
     * @hidden
     * Used during rendering.
     */
    loadingState?: LoadingState;

    /**
     * If set to `true` the geometry has been already overlaid on elevation.
     */
    elevated: boolean = false;

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

    pathLengthSqr?: number;

    type: TextElementType;

    private m_poiInfo?: PoiInfo;

    private m_renderStyle?: TextRenderStyle;

    private m_layoutStyle?: TextLayoutStyle;

    /**
     * Creates a new `TextElement`.
     *
     * @param text The text to display.
     * @param points The position or a list of points for a curved text, both in local tile space.
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
        readonly points: THREE.Vector3[] | THREE.Vector3,
        readonly renderParams: TextRenderParameters | TextRenderStyle,
        readonly layoutParams: TextLayoutParameters | TextLayoutStyle,
        public priority = 0,
        public xOffset: number = 0,
        public yOffset: number = 0,
        public featureId?: number,
        public style?: string,
        public fadeNear?: number,
        public fadeFar?: number,
        readonly tileOffset?: number
    ) {
        if (renderParams instanceof TextRenderStyle) {
            this.renderStyle = renderParams;
        }
        if (layoutParams instanceof TextLayoutStyle) {
            this.layoutStyle = layoutParams;
        }

        this.type =
            points instanceof THREE.Vector3 ? TextElementType.PoiLabel : TextElementType.PathLabel;
    }

    /**
     * The text element position or the first point of the path used to render a curved text, both
     * in local tile space.
     */
    get position(): THREE.Vector3 {
        if (this.points instanceof Array) {
            const p = this.points[0];
            return p;
        }
        return this.points as THREE.Vector3;
    }

    /**
     * The list of points in local tile space used to render the text along a path or `undefined`.
     */
    get path(): THREE.Vector3[] | undefined {
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
     * Contains additional information about icon to be rendered along with text.
     */
    get poiInfo(): PoiInfo | undefined {
        return this.m_poiInfo;
    }

    set poiInfo(poiInfo: PoiInfo | undefined) {
        this.m_poiInfo = poiInfo;
        if (poiInfo !== undefined) {
            if (this.path !== undefined) {
                this.type = TextElementType.LineMarker;
            }
            const poiRenderOrder = this.renderOrder !== undefined ? this.renderOrder : 0;
            poiInfo.renderOrder = poiRenderOrder;
        }
    }

    /**
     * @returns The style used to render this text element, undefined if not set yet.
     */
    get renderStyle(): TextRenderStyle | undefined {
        return this.m_renderStyle;
    }

    /**
     * Sets style used for text rendering.
     * @param style The style to use.
     */
    set renderStyle(style: TextRenderStyle | undefined) {
        this.m_renderStyle = style;
    }

    /**
     * @returns The style used to layout this text element, undefined if not set yet.
     */
    get layoutStyle(): TextLayoutStyle | undefined {
        return this.m_layoutStyle;
    }

    /**
     * Sets the style used for text layout.
     * @param style The style to use.
     */
    set layoutStyle(style: TextLayoutStyle | undefined) {
        this.m_layoutStyle = style;
    }

    hasFeatureId(): boolean {
        return this.featureId !== undefined && this.featureId !== 0;
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
