/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import {
    Color,
    CubicInterpolant,
    DiscreteInterpolant,
    Interpolant,
    LinearInterpolant
} from "three";
import { ExponentialInterpolant } from "./ExponentialInterpolant";
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
import { SceneState } from "./TechniqueHandler";

export const logger = LoggerManager.instance.create("Interpolants");

const interpolants = [
    DiscreteInterpolant,
    LinearInterpolant,
    CubicInterpolant,
    ExponentialInterpolant
];

const tmpColor = new Color();

export abstract class BaseInterpolator {
    interpolant: Interpolant;

    constructor(readonly property: InterpolatedProperty<unknown>) {
        const nChannels = this.property.values.length / property.zoomLevels.length;

        const interpolatorConstructor = interpolants[property.interpolationMode];
        this.interpolant = new interpolatorConstructor(
            property.zoomLevels,
            property.values,
            nChannels
        );

        if (
            property.interpolationMode === InterpolationMode.Exponential &&
            property.exponent !== undefined
        ) {
            (this.interpolant as ExponentialInterpolant).exponent = property.exponent;
        }
    }

    abstract evaluate(sceneState: SceneState): string | number;
}

export class ColorInterpolator extends BaseInterpolator {
    constructor(property: InterpolatedProperty<unknown>) {
        super(property);
    }

    evaluate(sceneState: SceneState): number {
        this.interpolant.evaluate(sceneState.zoomLevel);

        return tmpColor
            .setHSL(
                this.interpolant.resultBuffer[0],
                this.interpolant.resultBuffer[1],
                this.interpolant.resultBuffer[2]
            )
            .getHex();
    }
}

export class LengthInterpolator extends BaseInterpolator {
    maskInterpolant?: Interpolant;

    constructor(property: InterpolatedProperty<string | number>) {
        super(property);

        if (property._stringEncodedNumeralDynamicMask !== undefined) {
            const interpolatorConstructor = interpolants[property.interpolationMode];
            this.maskInterpolant = new interpolatorConstructor(
                property.zoomLevels,
                property._stringEncodedNumeralDynamicMask,
                1
            );
            if (
                property.interpolationMode === InterpolationMode.Exponential &&
                property.exponent !== undefined
            ) {
                (this.maskInterpolant as ExponentialInterpolant).exponent = property.exponent;
            }
        }
    }

    evaluate(sceneState: SceneState): number {
        this.interpolant.evaluate(sceneState.zoomLevel);

        if (this.maskInterpolant === undefined) {
            return this.interpolant.resultBuffer[0];
        } else {
            this.maskInterpolant.evaluate(sceneState.zoomLevel);

            return (
                this.interpolant.resultBuffer[0] *
                (1 + this.maskInterpolant.resultBuffer[0] * (sceneState.pixel2World - 1))
            );
        }
    }
}

export function createInterpolator(
    definition: InterpolatedPropertyDefinition<unknown>
): BaseInterpolator | undefined {
    const interpolatedProperty = createInterpolatedProperty(definition);
    if (!interpolatedProperty) {
        return undefined;
    }

    switch (interpolatedProperty._stringEncodedNumeralType) {
        case StringEncodedNumeralType.Hex:
        case StringEncodedNumeralType.RGB:
        case StringEncodedNumeralType.HSL:
            return new ColorInterpolator(interpolatedProperty);
        default:
            return new LengthInterpolator(interpolatedProperty);
    }
}

export function createInterpolatedProperty(
    prop: InterpolatedPropertyDefinition<unknown>
): InterpolatedProperty<unknown> | undefined {
    removeDuplicatePropertyValues(prop);
    const propKeys = new Float32Array(prop.zoomLevels);
    let propValues;
    let maskValues;
    const firstValue = prop.values[0];
    switch (typeof firstValue) {
        default:
        case "number":
            propValues = new Float32Array((prop.values as any[]) as number[]);
            return {
                interpolationMode:
                    prop.interpolation !== undefined
                        ? InterpolationMode[prop.interpolation]
                        : InterpolationMode.Discrete,
                zoomLevels: propKeys,
                values: propValues,
                exponent: prop.exponent
            };
        case "boolean":
            propValues = new Float32Array(prop.values.length);
            for (let i = 0; i < prop.values.length; ++i) {
                propValues[i] = ((prop.values[i] as unknown) as boolean) ? 1 : 0;
            }
            return {
                interpolationMode: InterpolationMode.Discrete,
                zoomLevels: propKeys,
                values: propValues,
                exponent: prop.exponent
            };
        case "string":
            let needsMask = false;

            const matchedFormat = StringEncodedNumeralFormats.find(format =>
                format.regExp.test(firstValue)
            );
            if (matchedFormat === undefined) {
                logger.error(`No StringEncodedNumeralFormat matched ${firstValue}.`);
                return undefined;
            }
            propValues = new Float32Array(prop.values.length * matchedFormat.size);
            maskValues = new Float32Array(prop.values.length);
            needsMask = procesStringEnocodedNumeralInterpolatedProperty(
                matchedFormat,
                prop as InterpolatedPropertyDefinition<string>,
                propValues,
                maskValues
            );

            return {
                interpolationMode:
                    prop.interpolation !== undefined
                        ? InterpolationMode[prop.interpolation]
                        : InterpolationMode.Discrete,
                zoomLevels: propKeys,
                values: propValues,
                exponent: prop.exponent,
                _stringEncodedNumeralType: matchedFormat.type,
                _stringEncodedNumeralDynamicMask: needsMask ? maskValues : undefined
            };
    }
}

function removeDuplicatePropertyValues<T>(p: InterpolatedPropertyDefinition<T>) {
    for (let i = 0; i < p.values.length; ++i) {
        const firstIdx = p.zoomLevels.findIndex((a: number) => {
            return a === p.zoomLevels[i];
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
