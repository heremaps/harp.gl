/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DefaultTextStyle,
    HorizontalAlignment,
    TextLayoutStyle,
    VerticalAlignment
} from "@here/harp-text-canvas";

/**
 * Version of layout style stored.
 */
export enum LayoutUsed {
    Undefined = 0,
    ThemeBased,
    Alternative
}

/**
 * Defines possible text placement relative to anchor.
 */
export interface AnchorPlacement {
    h: HorizontalAlignment;
    v: VerticalAlignment;
}

/**
 * Layout state of the text part of the `TextElement`.
 *
 * Used mainly for multi-anchor placement algorithm.
 * @hidden
 */
export class LayoutState {
    private m_state = LayoutUsed.Undefined;
    private m_hAlign = DefaultTextStyle.DEFAULT_HORIZONTAL_ALIGNMENT;
    private m_vAlign = DefaultTextStyle.DEFAULT_VERTICAL_ALIGNMENT;

    /**
     * Set layout based on theme style defined.
     *
     * @param layoutStyle The original theme label style.
     */
    setFromBase(layoutStyle: TextLayoutStyle) {
        this.m_hAlign = layoutStyle.horizontalAlignment;
        this.m_vAlign = layoutStyle.verticalAlignment;
        this.m_state = LayoutUsed.ThemeBased;
    }

    /**
     * Override label style using alternative anchor placement.
     *
     * @param placement The new anchor placement.
     */
    setFromPlacement(placement: AnchorPlacement) {
        this.m_hAlign = placement.h;
        this.m_vAlign = placement.v;
        this.m_state = LayoutUsed.Alternative;
    }

    /**
     * Reset existing `LayoutState` to appear like a fresh state.
     */
    reset() {
        this.m_state = LayoutUsed.Undefined;
    }

    /**
     * @returns `true` if element has not yet been placed and layout variant assigned.
     */
    isUndefined(): boolean {
        return this.m_state === LayoutUsed.Undefined;
    }

    /**
     * @returns `true` if element is using original style defined in theme.
     */
    isBase(): boolean {
        return this.m_state === LayoutUsed.ThemeBased;
    }

    /**
     * @returns `true` if element is fading in.
     */
    isAlternative(): boolean {
        return this.m_state === LayoutUsed.Alternative;
    }

    get horizontalAlignment(): HorizontalAlignment {
        return this.m_hAlign;
    }

    get verticalAlignment(): VerticalAlignment {
        return this.m_vAlign;
    }

    /**
     * Clone this `LayoutState`.
     *
     * @returns Cloned `LayoutState`.
     */
    clone(): LayoutState {
        const res = new LayoutState();
        res.copy(this);
        return res;
    }

    /**
     * Copies the values of `other` to this [[LayoutState]].
     *
     * @param other The other [[LayoutState]] to copy.
     */
    copy(other: LayoutState) {
        this.m_hAlign = other.m_hAlign;
        this.m_vAlign = other.m_vAlign;
        this.m_state = other.m_state;
    }
}
