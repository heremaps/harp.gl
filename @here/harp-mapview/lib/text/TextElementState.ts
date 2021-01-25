/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    hAlignFromPlacement,
    hPlacementFromAlignment,
    TextPlacement,
    vAlignFromPlacement,
    vPlacementFromAlignment
} from "@here/harp-text-canvas";
import { assert } from "@here/harp-utils";

import { LayoutState } from "./LayoutState";
import { RenderState } from "./RenderState";
import { TextElement } from "./TextElement";
import { TextElementType } from "./TextElementType";

/**
 * `TextElementState` keeps the current state of a text element while it's being rendered.
 */
export class TextElementState {
    /**
     * @hidden
     * Used during label placement to reserve space from front to back.
     */
    private m_viewDistance: number | undefined;

    /**
     * @hidden
     * Used during rendering.
     */
    private m_iconRenderState?: RenderState;

    /**
     * @hidden
     * Used during rendering.
     */
    private m_textRenderState?: RenderState;
    /**
     * @hidden
     * Used to store recently used text layout.
     */
    private m_textLayoutState?: LayoutState;
    /**
     * @hidden
     * Stores index into path for TextElements that are of type LineMarker.
     */
    private readonly m_lineMarkerIndex?: number;

    /**
     *
     * @param element - TextElement this state represents
     * @param positionIndex - Optional index for TextElements of type LineMarker.
     */
    constructor(readonly element: TextElement, positionIndex?: number) {
        this.m_lineMarkerIndex = positionIndex;
    }

    get initialized(): boolean {
        return this.m_textRenderState !== undefined || this.m_iconRenderState !== undefined;
    }

    /**
     * @returns `true` if any component of the element is visible, `false` otherwise.
     */
    get visible(): boolean {
        if (this.m_textRenderState !== undefined && this.m_textRenderState.isVisible()) {
            return true;
        }

        const iconRenderState = this.iconRenderState;
        if (iconRenderState !== undefined && iconRenderState.isVisible()) {
            return true;
        }

        return false;
    }

    /**
     * Return the last text placement used.
     *
     * If the text wasn't yet rendered or have no alternative placements it will fallback to
     * style/theme based placement.
     *
     * @returns [[TextPlacement]] object containing vertical/horizontal align.
     */
    get textPlacement(): TextPlacement {
        const themeLayout = this.element.layoutStyle!;
        const stateLayout = this.m_textLayoutState;
        // Would be good to test for persistence when getting state layout, but with this
        // most of the isolated placement unit tests will fail.
        const lastPlacement =
            stateLayout !== undefined
                ? stateLayout.textPlacement
                : {
                      h: hPlacementFromAlignment(themeLayout.horizontalAlignment),
                      v: vPlacementFromAlignment(themeLayout.verticalAlignment)
                  };
        return lastPlacement;
    }

    /**
     * Set text placement to be used.
     *
     * This may be base text anchor placement as defined by style or alternative placement.
     *
     * @param placement - The new [[TextPlacement]] to be used.
     */
    set textPlacement(placement: TextPlacement) {
        if (this.m_textLayoutState === undefined && this.isBaseTextPlacement(placement) === true) {
            // Do nothing, layout state is not required cause we leave the base placement.
            return;
        }
        if (this.m_textLayoutState === undefined) {
            // State is not yet defined, but we have placement to store, either alternative or
            // not yet specified in the context of layoutStyle.
            this.m_textLayoutState = new LayoutState(placement);
        } else {
            this.m_textLayoutState.textPlacement = placement;
        }
    }

    /**
     * Returns information if the text placement provided is the base one defined in style (theme).
     *
     * @param placement - The [[TextPlacement]] to check.
     * @returns [[true]] if the placement provided is exactly the same as in theme base layout,
     * [[false]] if it differs from the basic layout provided in style or
     * [[undefined]] if the layout style is not yet defined so it is hard to say.
     */
    isBaseTextPlacement(placement: TextPlacement): boolean | undefined {
        const themeLayout = this.element.layoutStyle;
        if (themeLayout !== undefined) {
            return (
                hAlignFromPlacement(placement.h) === themeLayout.horizontalAlignment &&
                vAlignFromPlacement(placement.v) === themeLayout.verticalAlignment
            );
        }
        return undefined;
    }

    /**
     * Resets the element to an initialized state.
     */
    reset() {
        if (this.m_textRenderState !== undefined) {
            this.m_textRenderState.reset();
        }
        if (this.m_textLayoutState !== undefined) {
            if (this.element.layoutStyle !== undefined) {
                this.m_textLayoutState.reset(this.element.layoutStyle);
            } else {
                this.m_textLayoutState = undefined;
            }
        }

        if (this.iconRenderState) {
            (this.m_iconRenderState as RenderState).reset();
        }
        this.m_viewDistance = undefined;
        this.element.textBufferObject = undefined;
        this.element.bounds = undefined;
    }

    /**
     * Replaces given text element, inheriting its current state.
     * The predecessor text element state is erased.
     * @param predecessor - Text element state to be replaced.
     */
    replace(predecessor: TextElementState) {
        this.m_textRenderState = predecessor.m_textRenderState;
        this.m_textLayoutState = predecessor.m_textLayoutState;
        this.m_iconRenderState = predecessor.m_iconRenderState;
        predecessor.m_textRenderState = undefined;
        predecessor.m_textLayoutState = undefined;
        predecessor.m_iconRenderState = undefined;

        if (this.element.glyphs === undefined) {
            // Use the predecessor glyphs and case array until proper ones are computed.
            this.element.glyphs = predecessor.element.glyphs;
            this.element.glyphCaseArray = predecessor.element.glyphCaseArray;
        }
        this.element.bounds = undefined;
        this.element.textBufferObject = undefined;
    }

    /**
     * Returns the last computed distance of the text element to the camera.
     * @returns Distance to camera.
     */
    get viewDistance(): number | undefined {
        return this.m_viewDistance;
    }

    /**
     * Updates the text element state.
     * @param viewDistance - The new view distance to set. If `undefined`, element is considered to
     * be out of view.
     */
    update(viewDistance: number | undefined) {
        if (!this.initialized && viewDistance !== undefined) {
            this.initializeRenderStates();
        }

        this.setViewDistance(viewDistance);
    }

    /**
     * Sets the distance of the element to the current view center.
     * @param viewDistance - The new view distance to set. If `undefined`, element is considered to
     * be out of view.
     */
    setViewDistance(viewDistance: number | undefined) {
        this.m_viewDistance = viewDistance;
    }

    /**
     * Return the last distance that has been computed for sorting during placement. This may not be
     * the actual distance if the camera is moving, as the distance is computed only during
     * placement. If the property `alwaysOnTop` is true, the value returned is always `0`.
     *
     * @returns 0 or negative distance to camera.
     */
    get renderDistance(): number {
        return this.element.alwaysOnTop === true
            ? 0
            : this.m_viewDistance !== undefined
            ? -this.m_viewDistance
            : 0;
    }

    /**
     * @returns The text render state.
     */
    get textRenderState(): RenderState | undefined {
        return this.m_textRenderState;
    }

    /**
     * Returns the icon render state for the case where the text element has only one icon.
     * @returns The icon render state if the text element has a single icon, otherwise undefined.
     */
    get iconRenderState(): RenderState | undefined {
        return this.m_iconRenderState;
    }

    /**
     * Returns the index into the path of the TextElement if the TextElement is of type LineMarker,
     * `undefined` otherwise.
     */
    public get lineMarkerIndex(): number | undefined {
        return this.m_lineMarkerIndex;
    }

    /**
     * Returns the position of the TextElement. If this TextElementState belongs to a TextElement
     * of type LineMarker, it returns the position of the marker at the references index in the
     * path of the TextElement.
     */
    public get position(): THREE.Vector3 {
        return this.element.path !== undefined && this.m_lineMarkerIndex !== undefined
            ? this.element.path[this.m_lineMarkerIndex]
            : this.element.position;
    }

    /**
     * Updates the fading state to the specified time.
     * @param time - The current time.
     * @param disableFading - If `True` there will be no fading transitions, i.e., state will go
     * directly from FadedIn to FadedOut and vice versa.
     */
    updateFading(time: number, disableFading: boolean): void {
        if (this.m_textRenderState !== undefined) {
            this.m_textRenderState.updateFading(time, disableFading);
        }

        if (this.iconRenderState !== undefined) {
            this.iconRenderState.updateFading(time, disableFading);
        }
    }

    /**
     * Initialize text and icon render states
     */
    private initializeRenderStates() {
        assert(this.m_textRenderState === undefined);
        assert(this.m_textLayoutState === undefined);
        assert(this.m_iconRenderState === undefined);

        const { textFadeTime } = this.element;
        this.m_textRenderState = new RenderState(textFadeTime);

        if (
            this.element.type === TextElementType.PoiLabel ||
            this.element.type === TextElementType.LineMarker
        ) {
            // If there's no fade time for icon, use same as text to keep fading of text and icon
            // in sync.
            const techniqueIconFadeTime = this.element.poiInfo?.technique.iconFadeTime;
            const iconFadeTime =
                techniqueIconFadeTime !== undefined ? techniqueIconFadeTime * 1000 : textFadeTime;
            this.m_iconRenderState = new RenderState(iconFadeTime);
        }
    }
}

/**
 * Test if the TextElement this {@link TextElementState} refers to is of type LineMarker.
 * @param state - Text element state to test.
 */
export function isLineMarkerElementState(state: TextElementState) {
    return (state as any).m_lineMarkerIndex !== undefined;
}
