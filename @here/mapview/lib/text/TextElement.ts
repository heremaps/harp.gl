/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */
import { ImageTexture, LineMarkerTechnique, PoiTechnique } from "@here/datasource-protocol";
import {
    BG_TEXT_RENDER_ORDER,
    ContextualArabicConverter,
    GlyphDirection,
    TextHorizontalAlignment,
    TextVerticalAlignment
} from "@here/text-renderer";
import { Math2D } from "@here/utils";

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
     * Determines minimum zoom level for visibility. Can be used to reduce the number of visible
     * `TextElement`s based on zoom level.
     */
    minZoomLevel?: number;

    /**
     * Optional color of text. Overrides color in `style`.
     */
    color?: THREE.Color;

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
     * Flag specifying if all glyphs in this `TextElement` have loaded all the needed assets and are
     * ready for rendering.
     */
    allGlyphsLoaded: boolean = false;

    /**
     * Width of all glyph in this `TextElement`. Valid only after `allGlyphsLoaded` is `true`.
     */
    textWidth: number = 0;

    /**
     * General [[GlyphDirection]] for this `TextElement`. Valid only after `allGlyphsLoaded` is
     * `true`.
     */
    textDirection: GlyphDirection = GlyphDirection.LTR;

    /**
     * Flag that signals if this `TextElement` contains LTR/RTL glyphs. Valid only after
     * `allGlyphsLoaded` is `true`.
     */
    bidirectional: boolean = false;

    /**
     * Vertical alignment used when placing the glyphs in this `TextElement`.
     */
    verticalAlignment: TextVerticalAlignment = TextVerticalAlignment.Center;

    /**
     * Horizontal alignment used when placing the glyphs in this `TextElement`.
     */
    horizontalAlignment: TextHorizontalAlignment = TextHorizontalAlignment.Center;

    /**
     * Horizontal separation between the glyphs in this `TextElement`.
     */
    private m_trackingFactor: number = 0;

    private m_poiInfo?: PoiInfo;

    /**
     * @hidden
     * Stores code points for glyphs of text.
     */
    private m_codepoints?: number[];

    /**
     * @hidden
     * Stores if characters have been converted from lower-case to upper-case.
     */
    private m_convertedToUpperCase?: boolean[];

    /**
     * Creates a new `TextElement`.
     *
     * @param text The text to display.
     * @param points The position in world coordinates or a list of points in world coordinates for
     *               a curved text.
     * @param priority The priority of the `TextElement. Elements with the highest priority get
     *                 placed first, elements with priority of `0` are placed last, elements with a
     *                 negative value are always rendered, ignoring priorities and allowing
     *                 overrides.
     * @param scale The scale used to display the text.
     * @param xOffset Optional X offset of this `TextElement` in screen coordinates.
     * @param yOffset Optional Y offset of this `TextElement` in screen coordinates.
     * @param featureId Optional number to identify feature (originated from `OmvDataSource`).
     * @param style The style used to display the text.
     * @param allCaps Optional style feature. Overrides allCaps in `style`. If `true`, it will
     *                render text using upper-case letters only.
     * @param smallCaps Optional style feature. Overrides smallCaps in `style`. If `true`, it will
     *                  render lower-case characters as small upper-case characters.
     * @param oblique Optional style feature. If `true`, it will render the glyphs in this
     *                `TextElement` slightly slanted.
     * @param bold Optional style feature. If `true`, it will use a bold font to render this
     *             `TextElement`.
     * @param tracking Horizontal separation between the glyphs in this `TextElement`.
     */
    constructor(
        readonly text: string,
        readonly points: THREE.Vector2[] | THREE.Vector2 | THREE.Vector3,
        public priority = 0,
        readonly scale = 1,
        public xOffset?: number,
        public yOffset?: number,
        public featureId?: number,
        public style?: string,
        public allCaps?: boolean,
        public smallCaps?: boolean,
        public oblique?: boolean,
        public bold?: boolean,
        tracking?: number
    ) {
        if (tracking !== undefined) {
            this.m_trackingFactor = tracking;
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
     * Horizontal separation between the glyphs in this `TextElement`.
     * @default `0`
     */
    get tracking(): number {
        return this.m_trackingFactor;
    }

    set tracking(trackingFactor: number) {
        this.m_trackingFactor = trackingFactor;
    }

    /**
     * Get the [[text]] as code points.
     *
     * Caches result.
     * Use instead of `text.charCodeAt(i)` for amortized O(1) performance.
     *
     * @param allCaps Interpret all code points as uppercase characters.
     */
    computeCodePoints(allCaps?: boolean): number[] {
        if (this.m_codepoints === undefined) {
            let text = "";
            this.m_codepoints = [];
            this.m_convertedToUpperCase = [];
            for (const char of this.text) {
                const styledChar = allCaps === true ? char.toUpperCase() : char;
                const smallCaps = char !== styledChar;
                // A single character can be transformed into more than one character (ß -> SS)
                const nChars = styledChar.length;
                let charIdx = 0;
                while (charIdx++ < nChars) {
                    this.m_convertedToUpperCase.push(smallCaps);
                }
                text += styledChar;
            }

            const reshapedStr = ContextualArabicConverter.instance.convert(text);
            for (const char of reshapedStr) {
                this.m_codepoints.push(char.codePointAt(0)!);
            }
        }
        return this.m_codepoints as number[];
    }

    /**
     * Get an array of booleans describing if the characters in this `TextElement` have been
     * converted from lower-case into upper-case.
     */
    get convertedToUpperCase(): boolean[] {
        return this.m_convertedToUpperCase as boolean[];
    }

    /*
    * Get this `TextElement`'s text as unicode code points. Valid after `computeCodePoints` has
     * been called once.
     * @default `undefined`
     */
    get codePoints(): number[] {
        return this.m_codepoints as number[];
    }

    /**
     * Determine if the `TextElement` is a line marker.
     *
     * @returns `true` if this `TextElement` is a line marker.
     */
    get isLineMarker(): boolean {
        return (
            this.points !== undefined &&
            (this.m_poiInfo !== undefined && this.m_poiInfo.technique.name === "line-marker")
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
     * Contains additional information about icon to be rendered alog with text.
     */
    get poiInfo(): PoiInfo | undefined {
        return this.m_poiInfo;
    }

    set poiInfo(poiInfo: PoiInfo | undefined) {
        this.m_poiInfo = poiInfo;
        if (poiInfo !== undefined) {
            const poiRenderOrder =
                this.renderOrder !== undefined ? BG_TEXT_RENDER_ORDER + this.renderOrder : 0;
            poiInfo.renderOrder = poiRenderOrder;
        }
    }
}
