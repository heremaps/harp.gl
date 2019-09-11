/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, Expr, NumberLiteralExpr, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";
import { createInterpolatedProperty } from "../InterpolatedProperty";
import { InterpolatedPropertyDefinition } from "../InterpolatedPropertyDefs";

const operators = {
    interpolate: {
        call: (context: ExprEvaluatorContext, args: Expr[]): Value => {
            const interpolatorType = args[0];
            const input = args[1];
            const samples = args.slice(2);

            if (!(interpolatorType instanceof CallExpr)) {
                throw new Error("expected an interpolation type");
            }

            let interpolation: InterpolatedPropertyDefinition<any>["interpolation"];
            let exponent: number | undefined;

            if (interpolatorType.op === "linear") {
                interpolation = "Linear";
            } else if (interpolatorType.op === "discrete") {
                interpolation = "Discrete";
            } else if (interpolatorType.op === "cubic") {
                interpolation = "Cubic";
            } else if (interpolatorType.op === "exponential") {
                interpolation = "Exponential";
                const base = interpolatorType.children[0];
                if (!(base instanceof NumberLiteralExpr)) {
                    throw new Error("expected the base of the exponential interpolation");
                }
                exponent = base.value;
            } else {
                throw new Error("unrecognized interpolation type");
            }

            if (!(input instanceof CallExpr)) {
                throw new Error("expected the input of the interpolation");
            }

            if (input.op !== "zoom") {
                throw new Error("only 'zoom' is supported");
            }

            if (samples.length === 0 || samples.length % 2) {
                throw new Error("invalid number of samples");
            }

            const zoomLevels: any[] = [];
            const values: any[] = [];

            for (let i = 0; i < samples.length; i += 2) {
                const step = samples[i];
                if (!(step instanceof NumberLiteralExpr)) {
                    throw new Error("expected a numeric literal");
                }
                zoomLevels.push(step.value);
                values.push(context.evaluate(samples[i + 1]));
            }

            const result = createInterpolatedProperty({
                interpolation,
                zoomLevels,
                values,
                exponent
            });

            if (result === undefined) {
                throw new Error("failed to create interpolator");
            }

            return result;
        }
    }
};

export const InterpolationOperators: OperatorDescriptorMap = operators;
export type InterpolationOperatorNames = keyof typeof operators;
