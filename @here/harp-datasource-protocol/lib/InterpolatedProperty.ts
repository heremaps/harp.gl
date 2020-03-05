/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { assert, LoggerManager } from "@here/harp-utils";
import { ColorUtils } from "./ColorUtils";
import { Env } from "./Env";
import { ExponentialInterpolant } from "./ExponentialInterpolant";
import { Expr, ExprScope, Value } from "./Expr";
import { InterpolatedPropertyDefinition, InterpolationMode } from "./InterpolatedPropertyDefs";
import {
    parseStringEncodedNumeral,
    StringEncodedColorFormats,
    StringEncodedMetricFormats,
    StringEncodedNumeralFormat,
    StringEncodedNumeralFormatMaxSize,
    StringEncodedNumeralFormats,
    StringEncodedNumeralType
} from "./StringEncodedNumeral";

const logger = LoggerManager.instance.create("InterpolatedProperty");

const interpolants = [
    THREE.DiscreteInterpolant,
    THREE.LinearInterpolant,
    THREE.CubicInterpolant,
    ExponentialInterpolant
];

const tmpBuffer = new Array<number>(StringEncodedNumeralFormatMaxSize);

/**
 * Property which value is interpolated across different zoom levels.
 */
export interface InterpolatedProperty {
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
    values: ArrayLike<any>;

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

/**
 * Type guard to check if an object is an instance of `InterpolatedProperty`.
 */
export function isInterpolatedProperty(p: any): p is InterpolatedProperty {
    if (
        p &&
        p.interpolationMode !== undefined &&
        p.zoomLevels instanceof Float32Array &&
        p.values !== undefined &&
        p.values.length > 0 &&
        (p.zoomLevels.length === p.values.length / 4 ||
            p.zoomLevels.length === p.values.length / 3 ||
            p.zoomLevels.length === p.values.length)
    ) {
        return true;
    }
    return false;
}

/**
* Get the value of the specified property in given `env`.

* @param property Property of a technique.
* @param env The [[Env]] used to evaluate the property
*/
export function getPropertyValue(property: Value | Expr | undefined, env: Env): any {
    if (Expr.isExpr(property)) {
        try {
            return property.evaluate(env, ExprScope.Dynamic);
        } catch (error) {
            logger.error(
                "failed to evaluate expression",
                JSON.stringify(property),
                "error",
                String(error)
            );
            return null;
        }
    }

    if (property === null || typeof property === "undefined") {
        return null;
    } else if (typeof property !== "string") {
        // Property in numeric or array, etc. format
        return property;
    } else {
        // Non-interpolated string encoded numeral parsing
        const pixelToMeters = (env.lookup("$pixelToMeters") as number) || 1;
        const value = parseStringEncodedNumeral(property, pixelToMeters);
        return value !== undefined ? value : property;
    }
}

export function evaluateInterpolatedProperty(property: InterpolatedProperty, env: Env): any {
    const level = env.lookup("$zoom") as number;
    const pixelToMeters = env.lookup("$pixelToMeters") as number;

    if (property._stringEncodedNumeralType !== undefined) {
        switch (property._stringEncodedNumeralType) {
            case StringEncodedNumeralType.Meters:
            case StringEncodedNumeralType.Pixels:
                return getInterpolatedMetric(property, level, pixelToMeters);
            case StringEncodedNumeralType.Hex:
            case StringEncodedNumeralType.RGB:
            case StringEncodedNumeralType.RGBA:
            case StringEncodedNumeralType.HSL:
                return getInterpolatedColor(property, level);
        }
    }
    return getInterpolatedMetric(property, level, pixelToMeters);
}

function getInterpolatedMetric(
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

    assert(nChannels === 3 || nChannels === 4);
    // ColorUtils.getHexFromRgba() does not clamp the values which may be out of
    // color channels range (0 <= c <= 1) after interpolation.
    if (nChannels === 4) {
        return ColorUtils.getHexFromRgba(
            THREE.MathUtils.clamp(interpolant.resultBuffer[0], 0, 1),
            THREE.MathUtils.clamp(interpolant.resultBuffer[1], 0, 1),
            THREE.MathUtils.clamp(interpolant.resultBuffer[2], 0, 1),
            THREE.MathUtils.clamp(interpolant.resultBuffer[3], 0, 1)
        );
    } else {
        return ColorUtils.getHexFromRgb(
            THREE.MathUtils.clamp(interpolant.resultBuffer[0], 0, 1),
            THREE.MathUtils.clamp(interpolant.resultBuffer[1], 0, 1),
            THREE.MathUtils.clamp(interpolant.resultBuffer[2], 0, 1)
        );
    }
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
            // TODO: Minimize effort for pre-matching the numeral format.
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
            ? StringEncodedMetricFormats
            : StringEncodedColorFormats;

    for (let valueIdx = 0; valueIdx < prop.values.length; ++valueIdx) {
        let matched = false;
        for (const valueFormat of allowedValueFormats) {
            const value = prop.values[valueIdx];
            matched = valueFormat.decoder(value, tmpBuffer);
            if (!matched) {
                continue;
            }

            if (valueFormat.mask !== undefined) {
                maskValues[valueIdx] = valueFormat.mask;
                needsMask = true;
            }

            for (let i = 0; i < valueFormat.size; ++i) {
                propValues[valueIdx * valueFormat.size + i] = tmpBuffer[i];
            }
            break;
        }
        if (!matched) {
            throw Error(
                `Not all interpolation values match the same format: ${JSON.stringify(prop)}`
            );
        }
    }

    return needsMask;
}
