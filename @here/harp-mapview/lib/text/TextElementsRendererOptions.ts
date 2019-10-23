import { TextElementsRenderer } from "./TextElementsRenderer";

/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const DEFAULT_FONT_CATALOG = "./resources/fonts/Default_FontCatalog.json";

/**
 * Default number of labels/POIs rendered in the scene
 */
const DEFAULT_MAX_NUM_RENDERED_TEXT_ELEMENTS = 500;

/**
 * Number of elements that are put into second queue. This second chance queue is used to render
 * TextElements that have not been on screen before. This is a quick source for elements that can
 * appear when the camera moves a bit, before new elements are placed.
 */
const DEFAULT_MAX_NUM_SECOND_CHANCE_ELEMENTS = 300;

/**
 * Maximum distance for text labels expressed as a ratio of distance to from the camera (0) to the
 * far plane (1.0). May be synchronized with fog value ?
 */
const DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS = 0.99;

/**
 * Minimum scaling factor that may be applied to labels when their are distant from focus point.
 */
const DEFAULT_LABEL_DISTANCE_SCALE_MIN = 0.7;

/**
 * Maximum scaling factor that may be applied to labels due to their distance from focus point.
 */
const DEFAULT_LABEL_DISTANCE_SCALE_MAX = 1.5;

const MIN_GLYPH_COUNT = 1024;

const MAX_GLYPH_COUNT = 32768;

export interface TextElementsRendererOptions {
    /**
     * The path to the font catalog file. Default is [[DEFAULT_FONT_CATALOG]].
     */
    fontCatalog?: string;
    /**
     * Optional initial number of glyphs (characters) for labels. In situations with limited,
     * available memory, decreasing this number may be beneficial.
     *
     * @default [[MIN_GLYPH_COUNT]]
     */
    minNumGlyphs?: number;
    /**
     * Optional limit of number of glyphs (characters) for labels. In situations with limited,
     * available memory, decreasing this number may be beneficial.
     *
     * @default [[MAX_GLYPH_COUNT]]
     */
    maxNumGlyphs?: number;
    /**
     * Limits the number of [[DataSource]] labels visible, such as road names and POIs.
     * On small devices, you can reduce this number to to increase performance.
     * @default [[DEFAULT_MAX_NUM_RENDERED_TEXT_ELEMENTS]].
     */
    maxNumVisibleLabels?: number;
    /**
     * The number of [[TextElement]]s that the [[TextElementsRenderer]] tries to render even
     * if they were not visible during placement. This property only applies to [[TextElement]]s
     * that were culled by the frustum; useful for map movements and animations.
     * @default [[DEFAULT_MAX_NUM_SECOND_CHANCE_ELEMENTS]].
     */
    numSecondChanceLabels?: number;
    /**
     * The maximum distance for [[TextElement]] to be rendered, expressed as a fraction of
     * the distance between the near and far plane [0, 1.0].
     * @default [[DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS]].
     */
    maxDistanceRatioForTextLabels?: number;
    /**
     * The maximum distance for [[TextElement]] with icons to be rendered,
     * expressed as a fraction of the distance
     * between the near and far plane [0, 1.0].
     * @default [[DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS]].
     */
    maxDistanceRatioForPoiLabels?: number;
    /**
     * The minimum scaling factor that may be applied to [[TextElement]]s due to their distance.
     * If not defined the default value specified in [[TextElementsRenderer]] will be used.
     * @default [[DEFAULT_LABEL_DISTANCE_SCALE_MIN]].
     */
    labelDistanceScaleMin?: number;
    /**
     * The maximum scaling factor that may be applied to [[TextElement]]s due to their distance.
     * If not defined the default value specified in [[TextElementsRenderer]] will be used.
     * @default [[DEFAULT_LABEL_DISTANCE_SCALE_MAX]].
     */
    labelDistanceScaleMax?: number;

    /**
     * Disable all fading animations for debugging and performance measurement.
     * @default `false`
     */
    disableFading?: boolean;
}

/**
 * Initializes undefined text renderer options to default values.
 * @param options The options to be initialized.
 */
export function initializeDefaultOptions(options: TextElementsRendererOptions) {
    if (options.fontCatalog === undefined) {
        options.fontCatalog = DEFAULT_FONT_CATALOG;
    }

    if (options.minNumGlyphs === undefined) {
        options.minNumGlyphs = MIN_GLYPH_COUNT;
    }
    if (options.maxNumGlyphs === undefined) {
        options.maxNumGlyphs = MAX_GLYPH_COUNT;
    }
    if (options.maxNumVisibleLabels === undefined) {
        options.maxNumVisibleLabels = DEFAULT_MAX_NUM_RENDERED_TEXT_ELEMENTS;
    }
    // TODO: Unused so far.
    if (options.numSecondChanceLabels === undefined) {
        options.numSecondChanceLabels = DEFAULT_MAX_NUM_SECOND_CHANCE_ELEMENTS;
    }
    if (options.labelDistanceScaleMin === undefined) {
        options.labelDistanceScaleMin = DEFAULT_LABEL_DISTANCE_SCALE_MIN;
    }
    if (options.labelDistanceScaleMax === undefined) {
        options.labelDistanceScaleMax = DEFAULT_LABEL_DISTANCE_SCALE_MAX;
    }
    if (options.maxDistanceRatioForTextLabels === undefined) {
        options.maxDistanceRatioForTextLabels = DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS;
    }
    if (options.maxDistanceRatioForPoiLabels === undefined) {
        options.maxDistanceRatioForPoiLabels = DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS;
    }

    if (options.disableFading === undefined) {
        options.disableFading = false;
    }
}
