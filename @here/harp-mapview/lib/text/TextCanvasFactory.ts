/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FontCatalog, TextCanvas } from "@here/harp-text-canvas";
import { assert } from "@here/harp-utils";

export class TextCanvasFactory {
    private m_minGlyphCount: number = 0; //Min amount of glyphs each [[TextCanvas]] layer can store.
    private m_maxGlyphCount: number = 0; //Max amount of glyphs each [[TextCanvas]] layer can store.

    /**
     * Creates an instance of text canvas factory.
     * @param m_renderer -
     */
    constructor(private readonly m_renderer: THREE.WebGLRenderer) {}

    setGlyphCountLimits(min: number, max: number) {
        this.m_minGlyphCount = min;
        this.m_maxGlyphCount = max;
    }

    /**
     * Creates text canvas
     * @param fontCatalog - Initial [[FontCatalog]].
     * @param name - Optional name for the TextCavas
     */
    createTextCanvas(fontCatalog: FontCatalog, name?: string): TextCanvas {
        assert(this.m_maxGlyphCount > 0);

        return new TextCanvas({
            renderer: this.m_renderer,
            fontCatalog,
            minGlyphCount: this.m_minGlyphCount,
            maxGlyphCount: this.m_maxGlyphCount,
            name
        });
    }
}
