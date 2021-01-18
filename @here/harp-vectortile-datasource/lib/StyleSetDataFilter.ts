/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";

import { OmvFeatureFilter } from "./OmvDataFilter";

/**
 * An [[OmvFeatureFilter]] implementation that queries [[StyleSetEvaluator]]
 * if given layers/features should be processed.
 *
 * Used in [[OmvDecoder]] to skip processing of layers/features that doesn't
 * have associated rules in style.
 *
 * @see [[StyleSetEvaluator.wantsFeature]]
 * @see [[StyleSetEvaluator.wantsLayer]]
 */
export class StyleSetDataFilter implements OmvFeatureFilter {
    hasKindFilter: boolean = false;

    constructor(readonly styleSetEvaluator: StyleSetEvaluator) {}

    wantsLayer(layer: string, level: number): boolean {
        return this.styleSetEvaluator.wantsLayer(layer);
    }

    wantsPointFeature(layer: string): boolean {
        return this.styleSetEvaluator.wantsFeature(layer, "point");
    }

    wantsLineFeature(layer: string): boolean {
        return this.styleSetEvaluator.wantsFeature(layer, "line");
    }

    wantsPolygonFeature(layer: string): boolean {
        return this.styleSetEvaluator.wantsFeature(layer, "polygon");
    }

    wantsKind(): boolean {
        return true;
    }
}
