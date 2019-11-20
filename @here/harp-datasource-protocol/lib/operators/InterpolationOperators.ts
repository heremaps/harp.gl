/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, Expr, ExprScope, NumberLiteralExpr, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";
import { createInterpolatedProperty, getPropertyValue } from "../InterpolatedProperty";
import { InterpolatedPropertyDefinition } from "../InterpolatedPropertyDefs";

/**
 * Evaluates the given piecewise function.
 */
function step(context: ExprEvaluatorContext, args: Expr[]) {
    if (args.length < 3 || args.length % 2) {
        throw new Error("not enough arguments");
    }

    const value = context.evaluate(args[0]) as number;

    if (value === null) {
        // returns the default value of step.
        return context.evaluate(args[1]);
    }

    if (typeof value !== "number") {
        throw new Error(`the input of a 'step' operator must have type 'number'`);
    }

    let first = 1;
    let last = args.length / 2 - 1;

    while (first < last) {
        // tslint:disable-next-line: no-bitwise
        const mid = (first + last) >>> 1;
        const stop = args[mid * 2];

        if (!(stop instanceof NumberLiteralExpr)) {
            throw new Error("expected a numeric literal");
        }

        if (value < stop.value) {
            last = mid - 1;
        } else if (value > stop.value) {
            first = mid + 1;
        } else {
            last = mid;
        }
    }

    const result = args[first * 2];

    if (!(result instanceof NumberLiteralExpr)) {
        throw new Error("expected a numeric literal");
    }

    const index = result.value <= value ? first : first - 1;

    return context.evaluate(args[index * 2 + 1]);
}

const operators = {
    ppi: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const ppi = context.env.lookup("$ppi");
            if (typeof ppi === "number") {
                return ppi;
            }
            return 72;
        }
    },
    zoom: {
        call: (context: ExprEvaluatorContext, call: CallExpr): Value => {
            if (context.scope === ExprScope.Condition) {
                const zoom = context.env.lookup("$zoom")!;
                if (zoom !== undefined) {
                    return zoom;
                }
                throw new Error("failed to get the zoom level.");
            }
            // direct usages of 'zoom' outside technique filter conditions
            // and interpolations are not allowed.
            throw new Error("invalid usage of the 'zoom' operator.");
        }
    },
    interpolate: {
        call: (context: ExprEvaluatorContext, call: CallExpr): Value => {
            const interpolatorType = call.args[0];
            const input = call.args[1];
            const samples = call.args.slice(2);

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
                const base = interpolatorType.args[0];
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
                const stop = samples[i];
                if (!(stop instanceof NumberLiteralExpr)) {
                    throw new Error("expected a numeric literal");
                }
                zoomLevels.push(stop.value);
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

            if (context.scope === ExprScope.Dynamic) {
                return getPropertyValue(result, context.env);
            }

            return result;
        }
    },
    step: {
        call: (context: ExprEvaluatorContext, call: CallExpr): Value => {
            if (call.args[0] === undefined) {
                throw new Error("expected the input of the 'step' operator");
            }

            const input = call.args[0];

            if (
                (context.scope === ExprScope.Value || context.scope === ExprScope.Dynamic) &&
                input instanceof CallExpr &&
                input.op === "zoom"
            ) {
                if (call.args.length < 3 || call.args.length % 2) {
                    throw new Error("not enough arguments");
                }

                // Implement dynamic zoom-dependent 'step' for attribute
                // values using 'discrete' interpolations. This is needed
                // because (currently) the only dynamic values supported
                // by `MapView` are interpolations.
                const zoomLevels: number[] = [];
                const values: any[] = [];

                zoomLevels.push(Number.MIN_SAFE_INTEGER);
                values.push(context.evaluate(call.args[1]));

                for (let i = 2; i < call.args.length; i += 2) {
                    const stop = call.args[i];
                    if (!(stop instanceof NumberLiteralExpr)) {
                        throw new Error("expected a numeric literal");
                    }
                    zoomLevels.push(stop.value);
                    values.push(context.evaluate(call.args[i + 1]));
                }

                const interpolation = createInterpolatedProperty({
                    interpolation: "Discrete",
                    zoomLevels,
                    values
                });

                if (interpolation === undefined) {
                    throw new Error("failed to create interpolator");
                }

                if (context.scope === ExprScope.Dynamic) {
                    return getPropertyValue(interpolation, context.env);
                }

                return interpolation;
            }

            return step(context, call.args);
        }
    }
};

export const InterpolationOperators: OperatorDescriptorMap = operators;
export type InterpolationOperatorNames = keyof typeof operators;
