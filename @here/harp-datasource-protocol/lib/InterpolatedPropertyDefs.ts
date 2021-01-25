/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { JsonExpr } from "./Expr";

/**
 * Interpolation mode used when computing a [[InterpolatedProperty]] value for a given zoom level.
 * @internal
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
 * @internal
 */
export interface InterpolatedPropertyDefinition<T> {
    interpolation?: "Discrete" | "Linear" | "Cubic" | "Exponential";
    zoomLevels: number[];
    values: T[];
    exponent?: number;
}

/**
 * Checks if a property is interpolated.
 * @param p - property to be checked
 * @internal
 */
export function isInterpolatedPropertyDefinition<T>(
    p: any
): p is InterpolatedPropertyDefinition<T> {
    if (
        p &&
        p.interpolationMode === undefined &&
        Array.isArray(p.values) &&
        p.values.length > 0 &&
        p.values[0] !== undefined &&
        Array.isArray(p.zoomLevels) &&
        p.zoomLevels.length > 0 &&
        p.zoomLevels[0] !== undefined &&
        p.values.length === p.zoomLevels.length
    ) {
        return true;
    }
    return false;
}

/**
 * Converts an [[InterpolatedPropertyDefinition]] to a [[JsonExpr]].
 *
 * @param property - A valid [[InterpolatedPropertyDefinition]]
 */
export function interpolatedPropertyDefinitionToJsonExpr(
    property: InterpolatedPropertyDefinition<any>
): JsonExpr {
    if (property.interpolation === undefined || property.interpolation === "Discrete") {
        const step: JsonExpr = ["step", ["zoom"], property.values[0]];
        for (let i = 1; i < property.zoomLevels.length; ++i) {
            step.push(property.zoomLevels[i], property.values[i]);
        }
        return step;
    }
    const interpolation: JsonExpr = ["interpolate"];
    switch (property.interpolation) {
        case "Linear":
            interpolation.push(["linear"]);
            break;
        case "Cubic":
            interpolation.push(["cubic"]);
            break;
        case "Exponential":
            interpolation.push([
                "exponential",
                property.exponent !== undefined ? property.exponent : 2
            ]);
            break;
        default:
            throw new Error(`interpolation mode '${property.interpolation}' is not supported`);
    } //switch
    interpolation.push(["zoom"]);
    for (let i = 0; i < property.zoomLevels.length; ++i) {
        interpolation.push(property.zoomLevels[i], property.values[i]);
    }
    return interpolation;
}
