/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    IndexedTechniqueParams,
    LineMarkerTechnique,
    PoiTechnique,
    TextTechnique
} from "@here/harp-datasource-protocol";
import { TextLayoutStyle, TextRenderStyle } from "@here/harp-text-canvas";

import { Tile } from "../Tile";

export class TileTextStyleCache {
    private textRenderStyles: TextRenderStyle[] = [];
    private textLayoutStyles: TextLayoutStyle[] = [];
    private readonly tile: Tile;

    constructor(tile: Tile) {
        this.tile = tile;
    }

    clear() {
        this.textRenderStyles.length = 0;
        this.textLayoutStyles.length = 0;
    }

    getRenderStyle(
        technique: (TextTechnique | PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams
    ): TextRenderStyle {
        let style = this.textRenderStyles[technique._index];
        if (style === undefined) {
            style = this.textRenderStyles[
                technique._index
            ] = this.tile.mapView.textElementsRenderer.styleCache.createRenderStyle(
                this.tile,
                technique
            );
        }
        return style;
    }

    getLayoutStyle(
        technique: (TextTechnique | PoiTechnique | LineMarkerTechnique) & IndexedTechniqueParams
    ): TextLayoutStyle {
        let style = this.textLayoutStyles[technique._index];
        if (style === undefined) {
            style = this.textLayoutStyles[
                technique._index
            ] = this.tile.mapView.textElementsRenderer.styleCache.createLayoutStyle(
                this.tile,
                technique
            );
        }
        return style;
    }
}
