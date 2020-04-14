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
export interface InterpolatedPropertyDescriptor {
    /**
     * Interpolation mode that should be used for this property.
     */
    interpolationMode: InterpolationMode;

    /**
     * Zoom level keys array.
     */
    zoomLevels: ArrayLike<number>;

    /**
     * Property values array.
     */
    values: ArrayLike<Value>;

    /**
     * Exponent used in interpolation. Only valid with `Exponential` [[InterpolationMode]].
     */
    exponent?: number;

    /**
     * @hidden
     * true if the result should be stored as vector.
     */
    _vectorInterpolation?: boolean;

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

export class InterpolatedProperty {
    /**
     * Convert JSON representation of interpolated property to internal, normalized version that
     * can be evaluated by [[getPropertyValue]].
     *
     * @internal
     */
    static fromDefinition(
        def: InterpolatedPropertyDefinition<Value>
    ): InterpolatedProperty | undefined {
        removeDuplicatePropertyValues(def);

        const interpolationMode =
            def.interpolation !== undefined
                ? InterpolationMode[def.interpolation]
                : InterpolationMode.Discrete;

        const zoomLevels = new Float32Array(def.zoomLevels);

        let vectorComponents: number | undefined;
        if (def.values.every(v => v instanceof THREE.Vector2)) {
            vectorComponents = 2;
        } else if (def.values.every(v => v instanceof THREE.Vector3)) {
            vectorComponents = 3;
        } else if (def.values.every(v => v instanceof THREE.Vector4)) {
            vectorComponents = 4;
        }

        if (vectorComponents !== undefined) {
            const values = new Float32Array(def.values.length * vectorComponents);

            (def.values as Array<THREE.Vector2 | THREE.Vector3 | THREE.Vector4>).forEach((v, i) =>
                v.toArray(values, i * vectorComponents!)
            );

            return new InterpolatedProperty({
                interpolationMode,
                zoomLevels,
                values,
                _vectorInterpolation: true,
                exponent: def.exponent
            });
        }

        const firstValue = def.values[0];
        switch (typeof firstValue) {
            default:
            case "number":
            case "boolean":
                return new InterpolatedProperty({
                    interpolationMode,
                    zoomLevels,
                    values: new Float32Array(def.values as any),
                    exponent: def.exponent
                });
            case "string":
                // TODO: Minimize effort for pre-matching the numeral format.
                const matchedFormat = StringEncodedNumeralFormats.find(format =>
                    format.regExp.test(firstValue)
                );

                if (matchedFormat === undefined) {
                    if (interpolationMode === InterpolationMode.Discrete) {
                        return new InterpolatedProperty({
                            interpolationMode,
                            zoomLevels,
                            values: def.values
                        });
                    }

                    logger.error(`No StringEncodedNumeralFormat matched ${firstValue}.`);
                    return undefined;
                }

                let needsMask = false;

                const propValues = new Float32Array(def.values.length * matchedFormat.size);
                const maskValues = new Float32Array(def.values.length);
                needsMask = processStringEnocodedNumeralInterpolatedProperty(
                    matchedFormat,
                    def as InterpolatedPropertyDefinition<string>,
                    propValues,
                    maskValues
                );

                return new InterpolatedProperty({
                    interpolationMode,
                    zoomLevels,
                    values: propValues,
                    exponent: def.exponent,
                    _stringEncodedNumeralType: matchedFormat.type,
                    _stringEncodedNumeralDynamicMask: needsMask ? maskValues : undefined
                });
        }
    }

    constructor(readonly descriptor: InterpolatedPropertyDescriptor) {}

    evaluate(env: Env): Value {
        const zoom = env.lookup("$zoom") as number;
        const pixelToMeters = env.lookup("$pixelToMeters") as number;
        const { _stringEncodedNumeralType } = this.descriptor;

        switch (_stringEncodedNumeralType) {
            case StringEncodedNumeralType.Meters:
            case StringEncodedNumeralType.Pixels:
                return this.getInterpolatedMetric(zoom, pixelToMeters);

            case StringEncodedNumeralType.Hex:
            case StringEncodedNumeralType.RGB:
            case StringEncodedNumeralType.RGBA:
            case StringEncodedNumeralType.HSL:
                return this.getInterpolatedColor(zoom);

            default:
                return this.getInterpolatedMetric(zoom, pixelToMeters);
        }
    }

    private getInterpolatedMetric(
        zoom: number,
        pixelToMeters: number
    ): number | number[] | THREE.Vector2 | THREE.Vector3 | THREE.Vector4 {
        const {
            values,
            zoomLevels,
            interpolationMode,
            exponent,
            _stringEncodedNumeralDynamicMask,
            _vectorInterpolation
        } = this.descriptor;
        const nChannels = values.length / zoomLevels.length;
        const interpolant = new interpolants[interpolationMode](zoomLevels, values, nChannels);
        if (interpolationMode === InterpolationMode.Exponential && exponent !== undefined) {
            (interpolant as ExponentialInterpolant).exponent = exponent;
        }
        interpolant.evaluate(zoom);

        if (_stringEncodedNumeralDynamicMask === undefined) {
            if (_vectorInterpolation) {
                if (nChannels === 2) {
                    return new THREE.Vector2().fromArray(interpolant.resultBuffer);
                } else if (nChannels === 3) {
                    return new THREE.Vector3().fromArray(interpolant.resultBuffer);
                } else if (nChannels === 4) {
                    return new THREE.Vector4().fromArray(interpolant.resultBuffer);
                }
                throw new Error("invalid number of components");
            }
            return nChannels === 1 ? interpolant.resultBuffer[0] : [...interpolant.resultBuffer];
        } else {
            const maskInterpolant = new interpolants[interpolationMode](
                zoomLevels,
                _stringEncodedNumeralDynamicMask,
                1
            );
            if (interpolationMode === InterpolationMode.Exponential && exponent !== undefined) {
                (maskInterpolant as ExponentialInterpolant).exponent = exponent;
            }
            maskInterpolant.evaluate(zoom);

            return (
                interpolant.resultBuffer[0] *
                (1 + maskInterpolant.resultBuffer[0] * (pixelToMeters - 1))
            );
        }
    }

    private getInterpolatedColor(level: number): number {
        const { values, zoomLevels, interpolationMode, exponent } = this.descriptor;

        const nChannels = values.length / zoomLevels.length;
        const interpolant = new interpolants[interpolationMode](zoomLevels, values, nChannels);
        if (interpolationMode === InterpolationMode.Exponential && exponent !== undefined) {
            (interpolant as ExponentialInterpolant).exponent = exponent;
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
}

/**
 * Type guard to check if an object is an instance of `InterpolatedProperty`.
 */
export function isInterpolatedProperty(p: any): p is InterpolatedProperty {
    return p instanceof InterpolatedProperty;
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

function processStringEnocodedNumeralInterpolatedProperty(
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
