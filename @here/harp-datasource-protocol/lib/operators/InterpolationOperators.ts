/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, ExprScope, LiteralExpr, NumberLiteralExpr, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";
import {
    createInterpolatedProperty,
    evaluateInterpolatedProperty,
    InterpolatedProperty
} from "../InterpolatedProperty";
import { InterpolatedPropertyDefinition } from "../InterpolatedPropertyDefs";

type InterpolateCallExpr = CallExpr & {
    _mode?: InterpolatedPropertyDefinition<any>["interpolation"];
    _exponent?: number;
    _stops?: number[];
    _interpolatedProperty?: InterpolatedProperty;
};

/**
 * Evaluates the given piecewise function.
 */
function step(context: ExprEvaluatorContext, call: CallExpr) {
    const { args } = call;

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
        const stop = (args[mid * 2] as NumberLiteralExpr).value;

        if (value < stop) {
            last = mid - 1;
        } else if (value > stop) {
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

/**
 * Prepare and validate the "interpolate" call.
 *
 * @param call An [[Expr]] representing an "interpolate" call.
 * @hidden
 */
function prepareInterpolateCallExpr(call: InterpolateCallExpr) {
    if (call._interpolatedProperty || call._mode !== undefined) {
        return;
    }

    const interpolatorType = call.args[0];

    if (!(interpolatorType instanceof CallExpr)) {
        throw new Error("expected an interpolation type");
    }

    let mode: InterpolatedPropertyDefinition<any>["interpolation"];
    let exponent: number | undefined;

    if (interpolatorType.op === "linear") {
        mode = "Linear";
    } else if (interpolatorType.op === "discrete") {
        mode = "Discrete";
    } else if (interpolatorType.op === "cubic") {
        mode = "Cubic";
    } else if (interpolatorType.op === "exponential") {
        mode = "Exponential";
        const base = interpolatorType.args[0];
        if (!(base instanceof NumberLiteralExpr)) {
            throw new Error("expected the base of the exponential interpolation");
        }
        exponent = base.value;
    } else {
        throw new Error("unrecognized interpolation type");
    }

    const input = call.args[1];

    if (!(input instanceof CallExpr)) {
        throw new Error("expected the input of the interpolation");
    }

    if (input.op !== "zoom") {
        throw new Error("only 'zoom' is supported");
    }

    if (call.args.length === 2 || call.args.length % 2) {
        throw new Error("invalid number of samples");
    }

    const stops: number[] = [];
    const values: Value[] = [];

    let isConstantInterpolation = true;

    for (let i = 2; i < call.args.length; i += 2) {
        const stop = call.args[i];

        if (!(stop instanceof NumberLiteralExpr)) {
            throw new Error("expected a numeric literal");
        }

        if (stops.length > 0 && stop.value === stops[stops.length - 1]) {
            stops[stops.length - 1] = stop.value - 0.0000001;
        }

        stops.push(stop.value);

        if (isConstantInterpolation) {
            const value = call.args[i + 1];

            if (value instanceof LiteralExpr) {
                values.push(value.value);
            } else {
                isConstantInterpolation = false;
            }
        }
    }

    if (isConstantInterpolation) {
        const result = createInterpolatedProperty({
            interpolation: mode,
            exponent,
            zoomLevels: stops,
            values
        });

        if (!result) {
            throw new Error("failed to create interpolation");
        }

        call._interpolatedProperty = result;
    } else {
        call._mode = mode;
        call._exponent = exponent;
        call._stops = stops;
    }
}

type StepCallExpr = CallExpr & {
    /**
     * `true` if the input of `step` call is `["zoom"], otherwise false.
     */
    _inputIsZoom?: boolean;

    /**
     * The stops when the a constant [[InterpolatedProperty]] cannot be
     * created for this `["step"]` call.
     */
    _stops?: number[];

    /**
     * The [[InterpolatedProperty]] representing this `step` call,
     * otherwise `undefined` if an interpolated property cannot
     * be created at parsing time (e.g. one if the value of the step is not a literal).
     */
    _interpolatedProperty?: InterpolatedProperty;
};

/**
 * Classify the given `step` call.
 *
 * This function checks the input of the `step` and ensures that the stops
 * are literals.
 *
 * @param call A call to `["step", ...]`.
 * @hidden
 */
function classifyStepCallExpr(call: StepCallExpr) {
    if (call._inputIsZoom !== undefined) {
        // nothing to do, the `call` was already classified.
        return;
    }

    if (call.args[0] === undefined) {
        throw new Error("expected the input of the 'step' operator");
    }

    if (call.args.length < 3 || call.args.length % 2) {
        throw new Error("not enough arguments");
    }

    const input = call.args[0];

    // tslint:disable-next-line: prefer-conditional-expression
    if (input instanceof CallExpr && input.op === "zoom") {
        call._inputIsZoom = true;
    } else {
        call._inputIsZoom = false;
    }

    // check that the stops are literals.
    for (let i = 2; i < call.args.length; i += 2) {
        const stop = call.args[i];
        if (!(stop instanceof NumberLiteralExpr)) {
            throw new Error("expected a numeric literal");
        }
    }
}

/**
 * Prepares the given call for the dynamic exception.
 * This method collects the stops and
 *
 * @param call A call to `["step", ...]`.
 * @hidden
 */
function prepareStepCallExpr(call: StepCallExpr) {
    if (call._stops || call._interpolatedProperty) {
        // nothing to do, the `call` was already prepared for execution.
        return;
    }

    // collect the stops of the step call.
    const stops: number[] = [Number.MIN_SAFE_INTEGER];

    for (let i = 2; i < call.args.length; i += 2) {
        const stop = call.args[i] as NumberLiteralExpr;
        stops.push(stop.value);
    }

    // collect the values of the step call.
    const values: Value[] = [];
    let hasConstantValues = true;

    for (let i = 1; hasConstantValues && i < call.args.length; i += 2) {
        const literal = call.args[i];
        if (literal instanceof LiteralExpr) {
            values.push(literal.value);
        } else {
            hasConstantValues = false;
        }
    }

    if (hasConstantValues) {
        // all the values of this zoom-based `step` are constant,
        // create an interpolated property and store it together
        // with the call.
        const interpolatedProperty = createInterpolatedProperty({
            interpolation: "Discrete",
            zoomLevels: stops,
            values
        });

        if (interpolatedProperty === undefined) {
            throw new Error("failed to create interpolator");
        }

        call._interpolatedProperty = interpolatedProperty;
    } else {
        // the values the `["step"]` call are not constants,
        // cache the `zoomLevels` to avoid recreating input `Array`
        // when instantiating a new [[InterpolatedProperty]].
        call._stops = stops;
    }
}

const operators = {
    interpolate: {
        isDynamicOperator: (call: CallExpr): boolean => {
            return call.args[1] && call.args[1].isDynamic();
        },
        call: (context: ExprEvaluatorContext, call: InterpolateCallExpr): Value => {
            prepareInterpolateCallExpr(call);

            if (context.scope !== ExprScope.Dynamic) {
                return call;
            }

            let interpolatedProperty = call._interpolatedProperty;

            if (!interpolatedProperty) {
                const values: Value[] = [];

                for (let i = 2; i < call.args.length; i += 2) {
                    const value = context.evaluate(call.args[i + 1]);
                    values.push(value);
                }

                interpolatedProperty = createInterpolatedProperty({
                    interpolation: call._mode!,
                    exponent: call._exponent,
                    zoomLevels: call._stops!,
                    values
                });

                if (interpolatedProperty === undefined) {
                    throw new Error("failed to create interpolator");
                }
            }

            return evaluateInterpolatedProperty(interpolatedProperty, context.env);
        }
    },
    step: {
        isDynamicOperator: (call: CallExpr): boolean => {
            return call.args[0] && call.args[0].isDynamic();
        },
        call: (context: ExprEvaluatorContext, call: StepCallExpr): Value => {
            classifyStepCallExpr(call);

            if (context.scope === ExprScope.Value) {
                return call;
            }

            if (context.scope === ExprScope.Condition || call._inputIsZoom === false) {
                return step(context, call);
            }

            prepareStepCallExpr(call);

            let interpolatedProperty = call._interpolatedProperty;

            if (!interpolatedProperty) {
                // the values of the interpolation are not literals,
                // evaluate the sub expressions and combine them
                // with the constant stops computed when preparing this call.
                const values: Value[] = [];
                for (let i = 1; i < call.args.length; i += 2) {
                    const value = context.evaluate(call.args[i]);
                    values.push(value);
                }

                interpolatedProperty = createInterpolatedProperty({
                    interpolation: "Discrete",
                    zoomLevels: call._stops!,
                    values
                });

                if (interpolatedProperty === undefined) {
                    throw new Error("failed to create interpolator");
                }
            }

            return evaluateInterpolatedProperty(interpolatedProperty, context.env);
        }
    }
};

export const InterpolationOperators: OperatorDescriptorMap = operators;
export type InterpolationOperatorNames = keyof typeof operators;
