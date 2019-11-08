/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

function rgbaFloat2Color(r: number, g: number, b: number, a?: number) : number {
    r = THREE.Math.clamp(r, 0.0, 1.0);
    g = THREE.Math.clamp(g, 0.0, 1.0);
    b = THREE.Math.clamp(b, 0.0, 1.0);
    a = a === undefined ? 1.0 : THREE.Math.clamp(a, 0.0, 1.0);

    // tslint:disable-next-line: no-bitwise
    return ((a * 255) << 24) ^ ((r * 255 ) << 16) ^ ((g * 255 ) << 8) ^ ((b * 255 ) << 0);
}

function rgbaInt2Color(r: number, g: number, b: number, a?: number) : number {
    r = THREE.Math.clamp(r, 0, 255);
    g = THREE.Math.clamp(g, 0, 255);
    b = THREE.Math.clamp(b, 0, 255);
    a = a === undefined ? 255 : THREE.Math.clamp(a, 0, 255);

    // tslint:disable-next-line: no-bitwise
    return (a << 24) ^ (r << 16) ^ (g << 8) ^ (b << 0);
}

const tmpColor = new THREE.Color();
const operators = {
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
                return rgbaToString(r, g, b, a);
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
                return rgbaToString(r, g, b);
            }
            throw new Error(`unknown color 'rgb(${r},${g},${b})'`);
        }
    },
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
                return hslToString(h, s, l);
            }
            throw new Error(`unknown color 'hsl(${h},${s}%,${l}%)'`);
        }
    }
};

function rgbaToString(r: number, g: number, b: number, a?: number): string {
    // For now we simply ignore alpha component from rgba(...) expressions.
    // TODO: To be resolved with HARP-7517.
    return (
        "#" +
        tmpColor
            .setRGB(
                THREE.Math.clamp(r, 0, 255) / 255,
                THREE.Math.clamp(g, 0, 255) / 255,
                THREE.Math.clamp(b, 0, 255) / 255
            )
            .getHexString()
    );
}

function hslToString(h: number, s: number, l: number): string {
    return `hsl(${h},${Math.round(s)}%,${Math.round(l)}%)`;
}

export const ColorOperators: OperatorDescriptorMap = operators;
export type ColorOperatorNames = keyof typeof operators;
