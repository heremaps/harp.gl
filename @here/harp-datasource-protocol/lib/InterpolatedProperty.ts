/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MathUtils } from "@here/harp-geoutils";
import { CubicInterpolant, DiscreteInterpolant, LinearInterpolant } from "three";
import { ExponentialInterpolant } from "./ExponentialInterpolant";

import {
    InterpolatedProperty,
    InterpolatedPropertyDefinition,
    InterpolationMode,
    MaybeInterpolatedProperty
} from "./InterpolatedPropertyDefs";

const interpolants = [
    DiscreteInterpolant,
    LinearInterpolant,
    CubicInterpolant,
    ExponentialInterpolant
];

/**
 * Get the value of the specified property at the given zoom level. Handles [[InterpolatedProperty]]
 * instances as well as future interpolated values.
 *
 * @param property Property of a technique.
 * @param level Display level the property should be rendered at.
 */
export function getPropertyValue<T>(
    property: InterpolatedProperty<T> | MaybeInterpolatedProperty<T> | undefined,
    level: number
): T | undefined {
    if (!isInterpolatedProperty(property)) {
        if (isInterpolatedPropertyDefinition(property)) {
            throw new Error("Invalid property definition");
        }
        return property;
    } else {
        const nChannels = property.values.length / property.zoomLevels.length;
        const isMultiChannel = nChannels > 1;
        const interpolant = new interpolants[property.interpolationMode](
            property.zoomLevels,
            property.values,
            nChannels
        );
        if (
            property.interpolationMode === InterpolationMode.Exponential &&
            property.exponent !== undefined
        ) {
            (interpolant as ExponentialInterpolant).exponent = property.exponent;
        }
        interpolant.evaluate(level);
        let result = isMultiChannel ? "#" : 0;
        for (const value of interpolant.resultBuffer) {
            // tslint:disable:no-bitwise
            const val = isMultiChannel
                ? ("0" + ((MathUtils.clamp(value, 0, 1) * 255) | 0).toString(16)).slice(-2)
                : value;
            result += val;
        }
        return (result as unknown) as T;
    }
}

/**
 * Checks if a property is interpolated.
 * @param p property to be checked
 */
export function isInterpolatedPropertyDefinition<T>(
    p: any
): p is InterpolatedPropertyDefinition<T> {
    if (
        p !== undefined &&
        p.values instanceof Array &&
        p.values.length > 0 &&
        p.values[0] !== undefined &&
        p.zoomLevels instanceof Array &&
        p.zoomLevels.length > 0 &&
        p.zoomLevels[0] !== undefined &&
        p.values.length === p.zoomLevels.length
    ) {
        return true;
    }
    return false;
}

/**
 * Type guard to check if an object is an instance of `InterpolatedProperty`.
 */
export function isInterpolatedProperty<T>(p: any): p is InterpolatedProperty<T> {
    if (
        p !== undefined &&
        p.interpolationMode !== undefined &&
        p.zoomLevels !== undefined &&
        p.values !== undefined &&
        p.values.length > 0 &&
        (p.zoomLevels.length === p.values.length / 3 || p.zoomLevels.length === p.values.length)
    ) {
        return true;
    }
    return false;
}
