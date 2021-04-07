/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

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

// Allowed distance to screen border for early rejection of POIs during placement. Its range is
// [0..1] of screen size.
// A value of 0 will lead to POI labels popping in at the border of the screen. A large value will
// lead to many labels being placed outside the screen, with all the required actions for measuring
// and loading glyphs impacting performance.
const DEFAULT_MAX_DISTANCE_TO_BORDER = 0.2;

const MIN_GLYPH_COUNT = 1024;

const MAX_GLYPH_COUNT = 32768;

export interface TextElementsRendererOptions {
    /**
     * The path to the font catalog file.
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
     * Limits the number of {@link DataSource} labels visible, such as road names and POIs.
     * On small devices, you can reduce this number to to increase performance.
     * @default `undefined` (no limit).
     */
    maxNumVisibleLabels?: number;
    /**
     * The maximum distance for {@link TextElement} to be rendered, expressed as a fraction of
     * the distance between the near and far plane [0, 1.0].
     * @default [[DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS]].
     */
    maxDistanceRatioForTextLabels?: number;
    /**
     * The maximum distance for {@link TextElement} with icons to be rendered,
     * expressed as a fraction of the distance
     * between the near and far plane [0, 1.0].
     * @default [[DEFAULT_MAX_DISTANCE_RATIO_FOR_LABELS]].
     */
    maxDistanceRatioForPoiLabels?: number;
    /**
     * The minimum scaling factor that may be applied to {@link TextElement}s due to their distance.
     * If not defined the default value specified in {@link TextElementsRenderer} will be used.
     * @default [[DEFAULT_LABEL_DISTANCE_SCALE_MIN]].
     */
    labelDistanceScaleMin?: number;
    /**
     * The maximum scaling factor that may be applied to {@link TextElement}s due to their distance.
     * If not defined the default value specified in {@link TextElementsRenderer} will be used.
     * @default [[DEFAULT_LABEL_DISTANCE_SCALE_MAX]].
     */
    labelDistanceScaleMax?: number;

    /**
     * Disable all fading animations for debugging and performance measurement.
     * @default `false`
     */
    disableFading?: boolean;

    /**
     * Enable that new labels are delayed until movement is finished
     * @default `true`
     */
    delayLabelsUntilMovementFinished?: boolean;

    /**
     * If `true`, a replacement glyph ("?") is rendered for every missing glyph.
     * @default `false`
     */
    showReplacementGlyphs?: boolean;

    /**
     * The maximum distance to the screen border as a fraction of screen size [0..1].
     * @default [[DEFAULT_MAX_DISTANCE_TO_BORDER]].
     */
    maxPoiDistanceToBorder?: number;

    /**
     * An optional canvas element that renders 2D collision debug information.
     */
    collisionDebugCanvas?: HTMLCanvasElement;
}

/**
 * Initializes undefined text renderer options to default values.
 * @param options - The options to be initialized.
 */
export function initializeDefaultOptions(options: TextElementsRendererOptions) {
    if (options.minNumGlyphs === undefined) {
        options.minNumGlyphs = MIN_GLYPH_COUNT;
    }
    if (options.maxNumGlyphs === undefined) {
        options.maxNumGlyphs = MAX_GLYPH_COUNT;
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

    if (options.delayLabelsUntilMovementFinished === undefined) {
        options.delayLabelsUntilMovementFinished = true;
    }

    if (options.showReplacementGlyphs === undefined) {
        options.showReplacementGlyphs = false;
    }

    if (options.maxPoiDistanceToBorder === undefined) {
        options.maxPoiDistanceToBorder = DEFAULT_MAX_DISTANCE_TO_BORDER;
    }
}
