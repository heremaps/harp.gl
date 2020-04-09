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
    private m_hAlign = DefaultTextStyle.DEFAULT_HORIZONTAL_ALIGNMENT;
    private m_vAlign = DefaultTextStyle.DEFAULT_VERTICAL_ALIGNMENT;

    constructor(placement: AnchorPlacement) {
        this.textPlacement = placement;
    }
    /**
     * Set layout based on theme style defined and optional text placement.
     *
     * @param placement The optional new anchor placement.
     */
    set textPlacement(placement: AnchorPlacement) {
        this.m_hAlign = placement.h;
        this.m_vAlign = placement.v;
    }

    /**
     * Acquire current placement setup.
     *
     * Function returns alternative or base placement depending on layout state.
     *
     * @returns The current anchor placement.
     */
    get textPlacement(): AnchorPlacement {
        return { h: this.m_hAlign, v: this.m_vAlign };
    }

    /**
     * Reset existing `LayoutState` to contain values from style/theme layout.
     */
    reset(layoutStyle: TextLayoutStyle) {
        this.m_hAlign = layoutStyle.horizontalAlignment;
        this.m_vAlign = layoutStyle.verticalAlignment;
    }

    get horizontalAlignment(): HorizontalAlignment {
        return this.m_hAlign;
    }

    get verticalAlignment(): VerticalAlignment {
        return this.m_vAlign;
    }
}
