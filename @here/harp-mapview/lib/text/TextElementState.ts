/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
import { FadingState, RenderState } from "./RenderState";
import { TextElement } from "./TextElement";
import { TextElementGroupState } from "./TextElementGroupState";
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

    constructor(private readonly m_textElement: TextElement) {}

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
     * Resets the element to an initialized state.
     */
    reset() {
        if (this.m_textRenderState !== undefined) {
            this.m_textRenderState.reset();
        }

        if (this.iconRenderState) {
            (this.m_iconRenderStates as RenderState).reset();
        } else if (this.m_iconRenderStates !== undefined) {
            for (const renderState of this.m_iconRenderStates as RenderState[]) {
                renderState.reset();
            }
        }
    }

    get element() {
        return this.m_textElement;
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
     * @param groupState  The state of the group the element belongs to.
     * @param viewDistance The new view distance to set. If `undefined`, element is considered to
     * be out of view.
     */
    update(groupState: TextElementGroupState, viewDistance: number | undefined) {
        if (this.initialized) {
            this.setViewDistance(viewDistance, groupState);
        } else if (viewDistance !== undefined) {
            this.initialize(groupState, viewDistance);
        }
    }

    /**
     * Sets the distance of the element to the current view center.
     * @param viewDistance The new view distance to set. If `undefined`, element is considered to
     * be out of view.
     * @param groupState The state of the group the element belongs to.
     */
    setViewDistance(viewDistance: number | undefined, groupState: TextElementGroupState) {
        if (viewDistance === this.m_viewDistance) {
            return;
        }
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
        return this.m_textElement.alwaysOnTop === true
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
     * @returns True if any element visible after fading.
     */
    updateFading(time: number, disableFading: boolean) {
        let visible = false;

        if (this.m_textRenderState !== undefined) {
            this.m_textRenderState.updateFading(time, disableFading);
            visible = this.m_textRenderState.isVisible();
        }

        if (this.iconRenderState !== undefined) {
            const iconRenderState = this.m_iconRenderStates as RenderState;
            iconRenderState.updateFading(time, disableFading);
            visible = visible || iconRenderState.isVisible();
        } else if (this.iconRenderStates !== undefined) {
            for (const renderState of this.m_iconRenderStates as RenderState[]) {
                renderState.updateFading(time, disableFading);
                visible = visible || renderState.isVisible();
            }
        }

        return visible;
    }

    /**
     * @param groupState The state of the group to which this element belongs.
     * @param viewDistance Current distance of the element to the view center.
     */
    private initialize(groupState: TextElementGroupState, viewDistance: number) {
        assert(this.m_textRenderState === undefined);
        assert(this.m_iconRenderStates === undefined);

        this.setViewDistance(viewDistance, groupState);

        if (this.m_textElement.type === TextElementType.LineMarker) {
            this.m_iconRenderStates = new Array<RenderState>();
            for (const _point of this.m_textElement.path!) {
                const iconRenderStates = this.m_iconRenderStates as RenderState[];
                const renderState = new RenderState();
                renderState.state = FadingState.FadingIn;
                iconRenderStates.push(renderState);
            }
            return;
        }

        this.m_textRenderState = new RenderState();

        if (this.m_textElement.type === TextElementType.PoiLabel) {
            this.m_iconRenderStates = new RenderState();
        }
    }
}
