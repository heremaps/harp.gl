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
            const r = Number(context.evaluate(args[0]));
            const g = Number(context.evaluate(args[1]));
            const b = Number(context.evaluate(args[2]));
            tmpColor.setRGB(r, g, b);
            return "#" + tmpColor.getHexString();
        }
    }
};

export const ColorOperators: OperatorDescriptorMap = operators;
export type ColorOperatorNames = keyof typeof operators;
