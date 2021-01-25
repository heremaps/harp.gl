/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { ColorUtils } from "../ColorUtils";
import { CallExpr, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";
import { parseStringEncodedColor } from "../StringEncodedNumeral";

const operators = {
    alpha: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            let color: Value | undefined = context.evaluate(call.args[0]);
            if (typeof color === "string") {
                color = parseStringEncodedColor(color);
            }
            const alpha = typeof color === "number" ? ColorUtils.getAlphaFromHex(color) : 1;
            return alpha;
        }
    },
    rgba: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const r = context.evaluate(call.args[0]);
            const g = context.evaluate(call.args[1]);
            const b = context.evaluate(call.args[2]);
            const a = context.evaluate(call.args[3]);
            if (
                typeof r === "number" &&
                typeof g === "number" &&
                typeof b === "number" &&
                typeof a === "number" &&
                r >= 0 &&
                g >= 0 &&
                b >= 0 &&
                a >= 0 &&
                a <= 1
            ) {
                return rgbaToHex(r, g, b, a);
            }
            throw new Error(`unknown color 'rgba(${r},${g},${b},${a})'`);
        }
    },
    rgb: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const r = context.evaluate(call.args[0]);
            const g = context.evaluate(call.args[1]);
            const b = context.evaluate(call.args[2]);
            if (
                typeof r === "number" &&
                typeof g === "number" &&
                typeof b === "number" &&
                r >= 0 &&
                g >= 0 &&
                b >= 0
            ) {
                return rgbToHex(r, g, b);
            }
            throw new Error(`unknown color 'rgb(${r},${g},${b})'`);
        }
    },
    // Hsl operator contains angle modulated to <0, 360> range, percent of
    // saturation and lightness in <0, 100> range, i.e. hsl(360, 100, 100)
    hsl: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const h = context.evaluate(call.args[0]);
            const s = context.evaluate(call.args[1]);
            const l = context.evaluate(call.args[2]);
            if (
                typeof h === "number" &&
                typeof s === "number" &&
                typeof l === "number" &&
                h >= 0 &&
                s >= 0 &&
                l >= 0
            ) {
                return hslToHex(h, s, l);
            }
            throw new Error(`unknown color 'hsl(${h},${s}%,${l}%)'`);
        }
    }
};

function rgbaToHex(r: number, g: number, b: number, a: number): number {
    // We decode rgba color channels using custom hex format with transparency.
    return ColorUtils.getHexFromRgba(
        THREE.MathUtils.clamp(r, 0, 255) / 255,
        THREE.MathUtils.clamp(g, 0, 255) / 255,
        THREE.MathUtils.clamp(b, 0, 255) / 255,
        THREE.MathUtils.clamp(a, 0, 1)
    );
}

function rgbToHex(r: number, g: number, b: number): number {
    return ColorUtils.getHexFromRgb(
        THREE.MathUtils.clamp(r, 0, 255) / 255,
        THREE.MathUtils.clamp(g, 0, 255) / 255,
        THREE.MathUtils.clamp(b, 0, 255) / 255
    );
}

function hslToHex(h: number, s: number, l: number): number {
    return ColorUtils.getHexFromHsl(
        THREE.MathUtils.euclideanModulo(h, 360) / 360,
        THREE.MathUtils.clamp(s, 0, 100) / 100,
        THREE.MathUtils.clamp(l, 0, 100) / 100
    );
}

export const ColorOperators: OperatorDescriptorMap = operators;
export type ColorOperatorNames = keyof typeof operators;
