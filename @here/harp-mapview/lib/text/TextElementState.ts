/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
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
        this.m_viewDistance = undefined;
    }

    /**
     * Replaces given text element, inheriting its current state.
     * The predecessor text element state is erased.
     * @param predecessor Text element state to be replaced.
     */
    replace(predecessor: TextElementState) {
        this.m_textRenderState = predecessor.m_textRenderState;
        this.m_iconRenderStates = predecessor.m_iconRenderStates;
        predecessor.m_textRenderState = undefined;
        predecessor.m_iconRenderStates = undefined;

        // Use the predecessor glyphs and bounds until proper ones are computed.
        this.element.glyphs = predecessor.element.glyphs;
        this.element.bounds = predecessor.element.bounds;
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
        if (this.initialized) {
            this.setViewDistance(viewDistance);
        } else if (viewDistance !== undefined) {
            this.initialize(viewDistance);
        }
    }

    /**
     * Sets the distance of the element to the current view center.
     * @param viewDistance The new view distance to set. If `undefined`, element is considered to
     * be out of view.
     */
    setViewDistance(viewDistance: number | undefined) {
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
     * @returns True if any element visible after fading.
     */
    updateFading(time: number, disableFading: boolean) {
        let visible = false;

        if (this.m_textRenderState !== undefined) {
            visible = this.m_textRenderState.updateFading(time, disableFading);
        }

        if (this.iconRenderState !== undefined) {
            const iconRenderState = this.m_iconRenderStates as RenderState;
            visible = iconRenderState.updateFading(time, disableFading) || visible;
        } else if (this.iconRenderStates !== undefined) {
            for (const renderState of this.m_iconRenderStates as RenderState[]) {
                visible = renderState.updateFading(time, disableFading) || visible;
            }
        }

        return visible;
    }

    /**
     * @param viewDistance Current distance of the element to the view center.
     */
    private initialize(viewDistance: number) {
        assert(this.m_textRenderState === undefined);
        assert(this.m_iconRenderStates === undefined);

        this.setViewDistance(viewDistance);

        if (this.element.type === TextElementType.LineMarker) {
            this.m_iconRenderStates = new Array<RenderState>();
            for (const _point of this.element.points as THREE.Vector3[]) {
                const iconRenderStates = this.m_iconRenderStates as RenderState[];
                const renderState = new RenderState();
                iconRenderStates.push(renderState);
            }
            return;
        }

        this.m_textRenderState = new RenderState();

        if (this.element.type === TextElementType.PoiLabel) {
            this.m_iconRenderStates = new RenderState();
        }
    }
}
