/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StringEncodedNumeralType } from "./StringEncodedNumeral";

/**
 * Interpolation mode used when computing a [[InterpolatedProperty]] value for a given zoom level.
 */
export enum InterpolationMode {
    Discrete,
    Linear,
    Cubic,
    Exponential
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
    interpolation?: "Discrete" | "Linear" | "Cubic" | "Exponential";
    zoomLevels: number[];
    values: T[];
    exponent?: number;
}

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

    /**
     * Exponent used in interpolation. Only valid with `Exponential` [[InterpolationMode]].
     */
    exponent?: number;

    /**
     * @hidden
     * [[StringEncodedNumeral]] type needed to interpret interpolated values back to numbers.
     */
    _stringEncodedNumeralType?: StringEncodedNumeralType;

    /**
     * @hidden
     * Array of `0` and `1`mask values used to modify the interpolation behaviour of some
     * [[StringEncodedNumeral]]s.
     */
    _stringEncodedNumeralDynamicMask?: Float32Array;
}
