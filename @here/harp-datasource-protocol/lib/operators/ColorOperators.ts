/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Expr } from "../Expr";

import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const tmpColor = new THREE.Color();
const operators = {
    rgb: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const r = context.evaluate(args[0]);
            const g = context.evaluate(args[1]);
            const b = context.evaluate(args[2]);
            if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
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
            throw new Error(`unknown color 'rgb(${r},${g},${b})'`);
        }
    },
    hsl: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const h = context.evaluate(args[0]);
            const s = context.evaluate(args[1]);
            const l = context.evaluate(args[2]);
            if (
                typeof h === "number" &&
                typeof s === "number" &&
                typeof l === "number" &&
                h >= 0 &&
                s >= 0 &&
                l >= 0
            ) {
                return `hsl(${h},${Math.round(s)}%,${Math.round(l)}%)`;
            }
            throw new Error(`unknown color 'hsl(${h},${s}%,${l}%)'`);
        }
    }
};

export const ColorOperators: OperatorDescriptorMap = operators;
export type ColorOperatorNames = keyof typeof operators;
