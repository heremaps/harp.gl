/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interpolation mode used when computing a [[InterpolatedProperty]] value for a given zoom level.
 */
export enum InterpolationMode {
    Discrete,
    Linear,
    Cubic
}

/**
 * Interpolated property could have its value (some initial value should be provided) changed
 * according to an interpolation type.
 *
 * Here is an example of an interpolated property from a map style:
 * "lineWidth": {
 *  "interpolation": "Linear",
 *  "zoomLevels": [13, 14, 15],
 *  "values": [ 1.5, 1.2, 0.9]
 * }
 */
export interface InterpolatedPropertyDefinition<T> {
    interpolation?: "Discrete" | "Linear" | "Cubic";
    zoomLevels: number[];
    values: T[];
}

export type MaybeInterpolatedProperty<T> = T | InterpolatedPropertyDefinition<T>;

/**
 * Property which value is interpolated across different zoom levels.
 */
export interface InterpolatedProperty<T> {
    /**
     * Interpolation mode that should be used for this property.
     */
    interpolationMode: InterpolationMode;

    /**
     * Zoom level keys array.
     */
    zoomLevels: Float32Array;

    /**
     * Property values array.
     */
    values: Float32Array;
}
