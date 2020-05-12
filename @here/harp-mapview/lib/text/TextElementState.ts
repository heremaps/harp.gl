/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
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
     * Used during rendering. The array type is used for line markers only, which have a points
     * array and multiple icon positions to render. Since line markers use the same renderState
     * for text part and icon, there is no separate array of [[RenderState]]s for the text parts
     * of the line markers.
     */
    private m_iconRenderStates?: RenderState | RenderState[];

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

    constructor(readonly element: TextElement) {}

    get initialized(): boolean {
        return this.m_textRenderState !== undefined || this.m_iconRenderStates !== undefined;
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

        const iconRenderStates = this.iconRenderStates;
        if (iconRenderStates === undefined) {
            return false;
        }

        for (const state of iconRenderStates) {
            if (state.isVisible()) {
                return true;
            }
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
     * @param placement The new [[TextPlacement]] to be used.
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
     * @param placement The [[TextPlacement]] to check.
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
            (this.m_iconRenderStates as RenderState).reset();
        } else if (this.m_iconRenderStates !== undefined) {
            for (const renderState of this.m_iconRenderStates as RenderState[]) {
                renderState.reset();
            }
        }
        this.m_viewDistance = undefined;
        this.element.textBufferObject = undefined;
    }

    /**
     * Replaces given text element, inheriting its current state.
     * The predecessor text element state is erased.
     * @param predecessor Text element state to be replaced.
     */
    replace(predecessor: TextElementState) {
        this.m_textRenderState = predecessor.m_textRenderState;
        this.m_textLayoutState = predecessor.m_textLayoutState;
        this.m_iconRenderStates = predecessor.m_iconRenderStates;
        predecessor.m_textRenderState = undefined;
        predecessor.m_textLayoutState = undefined;
        predecessor.m_iconRenderStates = undefined;

        if (this.element.glyphs === undefined) {
            // Use the predecessor glyphs, bounds and case array until proper ones are computed.
            this.element.glyphs = predecessor.element.glyphs;
            this.element.bounds = predecessor.element.bounds;
            this.element.glyphCaseArray = predecessor.element.glyphCaseArray;
        }
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
     * @param viewDistance The new view distance to set. If `undefined`, element is considered to
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
     * @param viewDistance The new view distance to set. If `undefined`, element is considered to
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
        if (this.m_iconRenderStates === undefined) {
            return undefined;
        }

        return this.m_iconRenderStates instanceof RenderState ? this.m_iconRenderStates : undefined;
    }

    /**
     * Returns the icon render states for text elements with multiple icons.
     * @returns The icon render states if the text element has multiple icons, otherwise undefined.
     */
    get iconRenderStates(): RenderState[] | undefined {
        if (this.m_iconRenderStates === undefined) {
            return undefined;
        }

        return this.m_iconRenderStates instanceof RenderState
            ? undefined
            : (this.m_iconRenderStates as RenderState[]);
    }

    /**
     * Updates the fading state to the specified time.
     * @param time The current time.
     * @param disableFading If `True` there will be no fading transitions, i.e., state will go
     * directly from FadedIn to FadedOut and viceversa.
     */
    updateFading(time: number, disableFading: boolean): void {
        if (this.m_textRenderState !== undefined) {
            this.m_textRenderState.updateFading(time, disableFading);
        }

        if (this.iconRenderState !== undefined) {
            const iconRenderState = this.m_iconRenderStates as RenderState;
            iconRenderState.updateFading(time, disableFading);
        } else if (this.iconRenderStates !== undefined) {
            for (const renderState of this.m_iconRenderStates as RenderState[]) {
                renderState.updateFading(time, disableFading);
            }
        }
    }

    /**
     * Initialize text and icon render states
     */
    private initializeRenderStates() {
        assert(this.m_textRenderState === undefined);
        assert(this.m_textLayoutState === undefined);
        assert(this.m_iconRenderStates === undefined);

        const { textFadeTime } = this.element;
        const iconFadeTime = this.element.poiInfo?.technique.iconFadeTime;
        if (this.element.type === TextElementType.LineMarker) {
            this.m_iconRenderStates = new Array<RenderState>();
            for (const _point of this.element.points as THREE.Vector3[]) {
                const iconRenderStates = this.m_iconRenderStates as RenderState[];
                const renderState = new RenderState(iconFadeTime);
                iconRenderStates.push(renderState);
            }
            return;
        }

        this.m_textRenderState = new RenderState(textFadeTime);

        if (this.element.type === TextElementType.PoiLabel) {
            this.m_iconRenderStates = new RenderState(iconFadeTime);
        }
    }
}
