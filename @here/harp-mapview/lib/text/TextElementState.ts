/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_FADE_TIME, FadingState, RenderState } from "./RenderState";
import { TextElementType } from "./TextElementType";

/**
 * `TextElementState` keeps the current state of a text element while it's being rendered.
 */
export class TextElementState {
    /**
     * @hidden
     * Used during label placement to reserve space from front to back.
     */
    m_viewDistance?: number;

    /**
     * @hidden
     * Used during rendering. The array type is used for line markers only, which have a points
     * array and multiple icon positions to render. Since line markers use the same renderState
     * for text part and icon, there is no separate array of [[RenderState]]s for the text parts
     * of the line markers.
     */
    m_iconRenderStates?: RenderState | RenderState[];

    /**
     * @hidden
     * Used during rendering.
     */
    m_textRenderState?: RenderState;

    /**
     * Initializes the state.
     * @param textElementType The text element type.
     * @param disableFading True if fading is disabled, false otherwise.
     * @param textElementPointCount Number of points the text element has.
     */
    initialize(
        textElementType: TextElementType,
        disableFading: boolean,
        textElementPointCount: number = 1
    ) {
        const fadingTime = disableFading === true ? 0 : DEFAULT_FADE_TIME;

        if (textElementType === TextElementType.LineMarker) {
            this.m_iconRenderStates = new Array<RenderState>();
            for (let i = 0; i < textElementPointCount; ++i) {
                const iconRenderStates = this.m_iconRenderStates as RenderState[];
                const renderState = new RenderState();
                renderState.state = FadingState.FadingIn;
                renderState.fadingTime = fadingTime;
                iconRenderStates.push(renderState);
            }
            return;
        }

        this.m_textRenderState = new RenderState();
        this.m_textRenderState.fadingTime = fadingTime;

        if (textElementType === TextElementType.PoiLabel) {
            this.m_iconRenderStates = new RenderState();
            this.m_iconRenderStates.fadingTime = fadingTime;
        }
    }

    get initialized(): boolean {
        return this.m_textRenderState !== undefined || this.m_iconRenderStates !== undefined;
    }

    /**
     * Clears the state.
     */
    clear() {
        this.m_iconRenderStates = undefined;
        this.m_textRenderState = undefined;
    }

    /**
     * Returns the last computed distance of the text element to the camera.
     * @returns Distance to camera.
     */
    get viewDistance(): number | undefined {
        return this.m_viewDistance;
    }

    set viewDistance(distance: number | undefined) {
        this.m_viewDistance = distance;
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
}
