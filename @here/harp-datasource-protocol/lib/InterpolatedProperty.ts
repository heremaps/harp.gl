/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Color, CubicInterpolant, DiscreteInterpolant, LinearInterpolant } from "three";

import { ExponentialInterpolant } from "./ExponentialInterpolant";
import { StringEncodedNumeralFormats, StringEncodedNumeralType } from "./StringEncodedNumeral";

import {
    InterpolatedProperty,
    InterpolatedPropertyDefinition,
    InterpolationMode,
    MaybeInterpolatedProperty
} from "./InterpolatedPropertyDefs";

import { StyleColor, StyleLength } from "./TechniqueParams";

const interpolants = [
    DiscreteInterpolant,
    LinearInterpolant,
    CubicInterpolant,
    ExponentialInterpolant
];

const tmpColor = new Color();

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

/**
 * Get the value of the specified property at the given zoom level, represented as a `number` value.
 *
 * @param property Property of a technique.
 * @param level Display level the property should be rendered at.
 * @param pixelToMeters Optional pixels to meters conversion factor (needed for proper
 * interpolation of `length` values).
 *
 */
export function getPropertyValue<T>(
    property: InterpolatedProperty<T> | MaybeInterpolatedProperty<T>,
    level: number,
    pixelToMeters: number = 1.0
): number {
    if (isInterpolatedPropertyDefinition<T>(property)) {
        throw new Error("Cannot interpolate a InterpolatedPropertyDefinition.");
    } else if (!isInterpolatedProperty(property)) {
        if (typeof property !== "string") {
            return (property as unknown) as number;
        } else {
            const matchedFormat = StringEncodedNumeralFormats.find(format =>
                format.regExp.test(property)
            );
            if (matchedFormat === undefined) {
                throw new Error(`No StringEncodedNumeralFormat matched ${property}.`);
            }
            switch (matchedFormat.type) {
                case StringEncodedNumeralType.Meters:
                    return matchedFormat.decoder(property)[0];
                case StringEncodedNumeralType.Pixels:
                    return matchedFormat.decoder(property)[0] * pixelToMeters;
                case StringEncodedNumeralType.Hex:
                case StringEncodedNumeralType.RGB:
                case StringEncodedNumeralType.HSL:
                    const hslValues = matchedFormat.decoder(property);
                    return tmpColor.setHSL(hslValues[0], hslValues[1], hslValues[2]).getHex();
                default:
                    return matchedFormat.decoder(property)[0];
            }
        }
    } else if (property._stringEncodedNumeralType !== undefined) {
        switch (property._stringEncodedNumeralType) {
            case StringEncodedNumeralType.Meters:
            case StringEncodedNumeralType.Pixels:
                return getInterpolatedLength(property, level, pixelToMeters);
            case StringEncodedNumeralType.Hex:
            case StringEncodedNumeralType.RGB:
            case StringEncodedNumeralType.HSL:
                return getInterpolatedColor(property, level);
        }
    }
    return getInterpolatedLength(property, level, pixelToMeters);
}

function getInterpolatedLength(
    property: InterpolatedProperty<StyleLength>,
    level: number,
    pixelToMeters: number
): number {
    const nChannels = property.values.length / property.zoomLevels.length;
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

    if (property._stringEncodedNumeralDynamicMask === undefined) {
        return interpolant.resultBuffer[0];
    } else {
        const maskInterpolant = new interpolants[property.interpolationMode](
            property.zoomLevels,
            property._stringEncodedNumeralDynamicMask,
            1
        );
        if (
            property.interpolationMode === InterpolationMode.Exponential &&
            property.exponent !== undefined
        ) {
            (maskInterpolant as ExponentialInterpolant).exponent = property.exponent;
        }
        maskInterpolant.evaluate(level);

        return (
            interpolant.resultBuffer[0] *
            (1 + maskInterpolant.resultBuffer[0] * (pixelToMeters - 1))
        );
    }
}

function getInterpolatedColor(property: InterpolatedProperty<StyleColor>, level: number): number {
    const nChannels = property.values.length / property.zoomLevels.length;
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

    return tmpColor
        .setHSL(
            interpolant.resultBuffer[0],
            interpolant.resultBuffer[1],
            interpolant.resultBuffer[2]
        )
        .getHex();
}
