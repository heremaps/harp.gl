/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Color, CubicInterpolant, DiscreteInterpolant, LinearInterpolant } from "three";

import { LoggerManager } from "@here/harp-utils";
import { ExponentialInterpolant } from "./ExponentialInterpolant";
import { Expr, Value } from "./Expr";
import {
    InterpolatedProperty,
    InterpolatedPropertyDefinition,
    InterpolationMode
} from "./InterpolatedPropertyDefs";
import {
    StringEncodedHex,
    StringEncodedHSL,
    StringEncodedMeters,
    StringEncodedNumeralFormat,
    StringEncodedNumeralFormats,
    StringEncodedNumeralType,
    StringEncodedPixels,
    StringEncodedRGB
} from "./StringEncodedNumeral";

const logger = LoggerManager.instance.create("InterpolatedProperty");

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
 * Type guard to check if an object is an instance of `InterpolatedProperty`.
 */
export function isInterpolatedProperty(p: any): p is InterpolatedProperty {
    if (
        p !== undefined &&
        p.interpolationMode !== undefined &&
        p.zoomLevels instanceof Float32Array &&
        p.values !== undefined &&
        p.values.length > 0 &&
        (p.zoomLevels.length === p.values.length / 3 || p.zoomLevels.length === p.values.length)
    ) {
        return true;
    }
    return false;
}

/**
 * Get the value of the specified property at the given zoom level.
 *
 * @param property Property of a technique.
 * @param level Display level the property should be rendered at.
 * @param pixelToMeters Optional pixels to meters conversion factor (needed for proper
 * interpolation of `length` values).
 *
 */
export function getPropertyValue<T>(
    property: Value | Expr | InterpolatedProperty | undefined,
    level: number,
    pixelToMeters: number = 1.0
): any {
    if (isInterpolatedPropertyDefinition<T>(property)) {
        throw new Error("Cannot interpolate a InterpolatedPropertyDefinition.");
    } else if (!isInterpolatedProperty(property)) {
        if (typeof property !== "string") {
            return property;
        } else {
            const matchedFormat = StringEncodedNumeralFormats.find(format =>
                format.regExp.test(property)
            );
            if (matchedFormat === undefined) {
                return property;
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
    property: InterpolatedProperty,
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

function getInterpolatedColor(property: InterpolatedProperty, level: number): number {
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

/**
 * Convert JSON representation of interpolated property to internal, normalized version that
 * can be evaluated by [[getPropertyValue]].
 */
export function createInterpolatedProperty(
    prop: InterpolatedPropertyDefinition<unknown>
): InterpolatedProperty | undefined {
    removeDuplicatePropertyValues(prop);

    const interpolationMode =
        prop.interpolation !== undefined
            ? InterpolationMode[prop.interpolation]
            : InterpolationMode.Discrete;

    const zoomLevels = new Float32Array(prop.zoomLevels);

    const firstValue = prop.values[0];
    switch (typeof firstValue) {
        default:
        case "number":
        case "boolean":
            return {
                interpolationMode,
                zoomLevels,
                values: new Float32Array(prop.values as any),
                exponent: prop.exponent
            };
        case "string":
            const matchedFormat = StringEncodedNumeralFormats.find(format =>
                format.regExp.test(firstValue)
            );

            if (matchedFormat === undefined) {
                if (interpolationMode === InterpolationMode.Discrete) {
                    return {
                        interpolationMode,
                        zoomLevels,
                        values: prop.values
                    };
                }

                logger.error(`No StringEncodedNumeralFormat matched ${firstValue}.`);
                return undefined;
            }

            let needsMask = false;

            const propValues = new Float32Array(prop.values.length * matchedFormat.size);
            const maskValues = new Float32Array(prop.values.length);
            needsMask = procesStringEnocodedNumeralInterpolatedProperty(
                matchedFormat,
                prop as InterpolatedPropertyDefinition<string>,
                propValues,
                maskValues
            );

            return {
                interpolationMode,
                zoomLevels,
                values: propValues,
                exponent: prop.exponent,
                _stringEncodedNumeralType: matchedFormat.type,
                _stringEncodedNumeralDynamicMask: needsMask ? maskValues : undefined
            };
    }
}

function removeDuplicatePropertyValues<T>(p: InterpolatedPropertyDefinition<T>) {
    const eps = 0.001;

    // detect cubic interpolations and remove stops
    // closer than `eps`, this is needed to avoid
    // possible NaN generated by the cubic interpolator.
    const isCubic = p.interpolation === "Cubic";

    for (let i = 0; i < p.values.length; ++i) {
        const firstIdx = p.zoomLevels.findIndex(a => {
            return isCubic ? Math.abs(a - p.zoomLevels[i]) < eps : a === p.zoomLevels[i];
        });
        if (firstIdx !== i) {
            p.zoomLevels.splice(--i, 1);
            p.values.splice(--i, 1);
        }
    }
}

const colorFormats = [StringEncodedHSL, StringEncodedHex, StringEncodedRGB];
const worldSizeFormats = [StringEncodedMeters, StringEncodedPixels];

function procesStringEnocodedNumeralInterpolatedProperty(
    baseFormat: StringEncodedNumeralFormat,
    prop: InterpolatedPropertyDefinition<string>,
    propValues: Float32Array,
    maskValues: Float32Array
): boolean {
    let needsMask = false;
    const allowedValueFormats =
        baseFormat.type === StringEncodedNumeralType.Meters ||
        baseFormat.type === StringEncodedNumeralType.Pixels
            ? worldSizeFormats
            : colorFormats;

    for (let valueIdx = 0; valueIdx < prop.values.length; ++valueIdx) {
        for (const valueFormat of allowedValueFormats) {
            const value = prop.values[valueIdx];
            if (!valueFormat.regExp.test(value)) {
                continue;
            }

            if (valueFormat.mask !== undefined) {
                maskValues[valueIdx] = valueFormat.mask;
                needsMask = true;
            }

            const result = valueFormat.decoder(value);
            for (let i = 0; i < result.length; ++i) {
                propValues[valueIdx * valueFormat.size + i] = result[i];
            }
            break;
        }
    }

    return needsMask;
}
