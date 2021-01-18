/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    BooleanLiteralExpr,
    CallExpr,
    CaseExpr,
    Env,
    Expr,
    ExprScope,
    ExprVisitor,
    HasAttributeExpr,
    InterpolateExpr,
    LiteralExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
    StepExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";
import { ArrayOperators } from "./operators/ArrayOperators";
import { CastOperators } from "./operators/CastOperators";
import { ColorOperators } from "./operators/ColorOperators";
import { ComparisonOperators } from "./operators/ComparisonOperators";
import { FeatureOperators } from "./operators/FeatureOperators";
import { FlowOperators } from "./operators/FlowOperators";
import { MapOperators } from "./operators/MapOperators";
import { MathOperators } from "./operators/MathOperators";
import { MiscOperators } from "./operators/MiscOperators";
import { ObjectOperators } from "./operators/ObjectOperators";
import { StringOperators } from "./operators/StringOperators";
import { TypeOperators } from "./operators/TypeOperators";
import { VectorOperators } from "./operators/VectorOperators";
import { Pixels } from "./Pixels";
import { RGBA } from "./RGBA";

export interface OperatorDescriptor {
    /**
     * Returns `true` if this operator requires a dynamic execution context (e.g. ["zoom"]).
     */
    isDynamicOperator?: (call: CallExpr) => boolean;

    /**
     * Evaluates the given expression.
     */
    call: (context: ExprEvaluatorContext, call: CallExpr) => Value;

    /**
     * Partial evaluate the `call` expression using the given `context`.
     */
    partialEvaluate?: (context: ExprEvaluatorContext, call: CallExpr) => Value;
}

export interface OperatorDescriptorMap {
    [name: string]: OperatorDescriptor;
}

const operatorDescriptors = new Map<string, OperatorDescriptor>();

/**
 * Promote string literals and values to color and pixel constants.
 *
 * @hidden
 * @internal
 */
function promoteValue(context: ExprEvaluatorContext, expr: Expr): Value {
    if (expr instanceof StringLiteralExpr) {
        return expr.promotedValue ?? expr.value;
    }

    const value = context.evaluate(expr);

    if (typeof value === "string") {
        return RGBA.parse(value) ?? Pixels.parse(value) ?? value;
    }

    return value;
}

function cubicInterpolate(
    context: ExprEvaluatorContext,
    interp: InterpolateExpr,
    t: number
): Value {
    if (t < interp.stops[0][0]) {
        return promoteValue(context, interp.stops[0][1]);
    } else if (t >= interp.stops[interp.stops.length - 1][0]) {
        return promoteValue(context, interp.stops[interp.stops.length - 1][1]);
    }

    // indices
    const i1 = interp.stops.findIndex(stop => stop[0] > t);
    const i0 = Math.max(0, i1 - 1);
    const iP = i0 === 0 ? i1 : i0 - 1;
    const iN = i1 < interp.stops.length - 1 ? i1 + 1 : i1 - 1;

    // keys
    const tP = interp.stops[iP][0];
    const t0 = interp.stops[i0][0];
    const t1 = interp.stops[i1][0];
    const tN = interp.stops[iN][0];

    const dt = (t1 - t0) * 0.5;
    const wP = dt / (t0 - tP);
    const wN = dt / (tN - t1);
    const p = (t - t0) / (t1 - t0);
    const pp = p * p;
    const ppp = pp * p;

    // coefficients
    const cP = -wP * ppp + 2 * wP * pp - wP * p;
    const c0 = (1 + wP) * ppp + (-1.5 - 2 * wP) * pp + (-0.5 + wP) * p + 1;
    const c1 = (-1 - wN) * ppp + (1.5 + wN) * pp + 0.5 * p;
    const cN = wN * ppp - wN * pp;

    // values
    const vP = promoteValue(context, interp.stops[iP][1]);
    const v0 = promoteValue(context, interp.stops[i0][1]);
    const v1 = promoteValue(context, interp.stops[i1][1]);
    const vN = promoteValue(context, interp.stops[iN][1]);

    if (
        typeof vP === "number" &&
        typeof v0 === "number" &&
        typeof v1 === "number" &&
        typeof vN === "number"
    ) {
        return cP * vP + c0 * v0 + c1 * v1 + cN * vN;
    } else if (
        vP instanceof RGBA &&
        v0 instanceof RGBA &&
        v1 instanceof RGBA &&
        vN instanceof RGBA
    ) {
        return new RGBA(
            THREE.MathUtils.clamp(cP * vP.r + c0 * v0.r + c1 * v1.r + cN * vN.r, 0, 1),
            THREE.MathUtils.clamp(cP * vP.g + c0 * v0.g + c1 * v1.g + cN * vN.g, 0, 1),
            THREE.MathUtils.clamp(cP * vP.b + c0 * v0.b + c1 * v1.b + cN * vN.b, 0, 1),
            THREE.MathUtils.clamp(cP * vP.a + c0 * v0.a + c1 * v1.a + cN * vN.a, 0, 1)
        );
    } else if (
        vP instanceof Pixels &&
        v0 instanceof Pixels &&
        v1 instanceof Pixels &&
        vN instanceof Pixels
    ) {
        return new Pixels(cP * vP.value + c0 * v0.value + c1 * v1.value + cN * vN.value);
    } else if (
        vP instanceof THREE.Color &&
        v0 instanceof THREE.Color &&
        v1 instanceof THREE.Color &&
        vN instanceof THREE.Color
    ) {
        return new THREE.Color(
            cP * vP.r + c0 * v0.r + c1 * v1.r + cN * vN.r,
            cP * vP.g + c0 * v0.g + c1 * v1.g + cN * vN.g,
            cP * vP.b + c0 * v0.b + c1 * v1.b + cN * vN.b
        );
    } else if (
        vP instanceof THREE.Vector2 &&
        v0 instanceof THREE.Vector2 &&
        v1 instanceof THREE.Vector2 &&
        vN instanceof THREE.Vector2
    ) {
        return new THREE.Vector2(
            cP * vP.x + c0 * v0.x + c1 * v1.x + cN * vN.x,
            cP * vP.y + c0 * v0.y + c1 * v1.y + cN * vN.y
        );
    } else if (
        vP instanceof THREE.Vector3 &&
        v0 instanceof THREE.Vector3 &&
        v1 instanceof THREE.Vector3 &&
        vN instanceof THREE.Vector3
    ) {
        return new THREE.Vector3(
            cP * vP.x + c0 * v0.x + c1 * v1.x + cN * vN.x,
            cP * vP.y + c0 * v0.y + c1 * v1.y + cN * vN.y,
            cP * vP.z + c0 * v0.z + c1 * v1.z + cN * vN.z
        );
    } else if (
        vP instanceof THREE.Vector4 &&
        v0 instanceof THREE.Vector4 &&
        v1 instanceof THREE.Vector4 &&
        vN instanceof THREE.Vector4
    ) {
        return new THREE.Vector4(
            cP * vP.x + c0 * v0.x + c1 * v1.x + cN * vN.x,
            cP * vP.y + c0 * v0.y + c1 * v1.y + cN * vN.y,
            cP * vP.z + c0 * v0.z + c1 * v1.z + cN * vN.z,
            cP * vP.w + c0 * v0.w + c1 * v1.w + cN * vN.w
        );
    } else if (Array.isArray(vP) && Array.isArray(v0) && Array.isArray(v1) && Array.isArray(vN)) {
        const N = vP.length;
        const r: number[] = [];
        for (let i = 0; i < N; ++i) {
            r[i] = cP * vP[i] + c0 * v0[i] + c1 * v1[i] + cN * vN[i];
        }
        return r;
    }

    throw new Error(`failed to interpolate values`);
}

/*
 * @hidden
 */
export class ExprEvaluatorContext {
    constructor(
        readonly evaluator: ExprEvaluator,
        readonly env: Env,
        readonly scope: ExprScope,
        readonly cache?: Map<Expr, Value>
    ) {}

    /**
     * Evaluate the given expression.
     *
     * @param expr - The {@link Expr} to evaluate.
     */
    evaluate(expr: Expr | undefined) {
        if (expr === undefined) {
            throw new Error("Failed to evaluate expression");
        }

        const cachedResult = this.cache?.get(expr);

        if (cachedResult !== undefined) {
            return cachedResult;
        }

        const result = expr.accept(this.evaluator, this);
        this.cache?.set(expr, result);
        return result;
    }

    /**
     * Wraps the given value in an {@link Expr} if needed.
     *
     * @param value -
     */
    wrapValue(value: Value | Expr): Expr {
        return Expr.isExpr(value) ? value : LiteralExpr.fromValue(value);
    }
}

/**
 * [[ExprEvaluator]] is used to evaluate {@link Expr} in a given environment.
 *
 * @hidden
 */
export class ExprEvaluator implements ExprVisitor<Value, ExprEvaluatorContext> {
    static defineOperator(op: string, builtin: OperatorDescriptor) {
        operatorDescriptors.set(op, builtin);
    }

    static defineOperators(builtins: OperatorDescriptorMap) {
        Object.getOwnPropertyNames(builtins).forEach(p => {
            this.defineOperator(p, builtins[p]);
        });
    }

    /**
     * Returns the [[OperatorDescriptor]] for the given operator name.
     * @hidden
     */
    static getOperator(op: string): OperatorDescriptor | undefined {
        return operatorDescriptors.get(op);
    }

    visitVarExpr(expr: VarExpr, context: ExprEvaluatorContext): Value {
        const value = context.env.lookup(expr.name);
        return value !== undefined ? value : null;
    }

    visitNullLiteralExpr(expr: NullLiteralExpr, context: ExprEvaluatorContext): Value {
        return null;
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: ExprEvaluatorContext): Value {
        return expr.value;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: ExprEvaluatorContext): Value {
        return expr.value;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, context: ExprEvaluatorContext): Value {
        return expr.value;
    }

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: ExprEvaluatorContext): Value {
        return expr.value;
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: ExprEvaluatorContext): Value {
        return context.env.lookup(expr.name) !== undefined;
    }

    visitMatchExpr(match: MatchExpr, context: ExprEvaluatorContext): Value {
        const r = context.evaluate(match.value);
        for (const [label, body] of match.branches) {
            if (Array.isArray(label) && (label as any[]).includes(r)) {
                return context.evaluate(body);
            } else if (label === r) {
                return context.evaluate(body);
            }
        }
        return context.evaluate(match.fallback);
    }

    visitCaseExpr(match: CaseExpr, context: ExprEvaluatorContext): Value {
        if (context.scope === ExprScope.Value) {
            const firstDynamicCondition = match.branches.findIndex(([condition, _]) =>
                condition.isDynamic()
            );

            if (firstDynamicCondition !== -1) {
                let branches: Array<[Expr, Expr]> | undefined;

                for (let i = 0; i < match.branches.length; ++i) {
                    const [condition, body] = match.branches[i];

                    const evaluatedCondition = context.evaluate(condition);
                    const evaluatedBody = context.evaluate(body);

                    if (i < firstDynamicCondition && Boolean(evaluatedCondition)) {
                        return evaluatedBody;
                    }

                    if (!Expr.isExpr(evaluatedCondition) && !Boolean(evaluatedCondition)) {
                        // skip this branch, it constantly evaluates to false.
                        continue;
                    }

                    if (branches === undefined) {
                        branches = [];
                    }

                    branches?.push([
                        context.wrapValue(evaluatedCondition),
                        context.wrapValue(evaluatedBody)
                    ]);

                    if (!Expr.isExpr(evaluatedCondition) && Boolean(evaluatedCondition)) {
                        // skip unreachble expressions
                        return new CaseExpr(branches, LiteralExpr.fromValue(null));
                    }
                }

                const fallback = context.evaluate(match.fallback);

                return branches === undefined
                    ? fallback
                    : new CaseExpr(branches, context.wrapValue(fallback));
            }
        }

        for (const [condition, body] of match.branches) {
            if (context.evaluate(condition)) {
                return context.evaluate(body);
            }
        }

        return context.evaluate(match.fallback);
    }

    visitCallExpr(expr: CallExpr, context: ExprEvaluatorContext): Value {
        const descriptor = expr.descriptor ?? operatorDescriptors.get(expr.op);

        if (descriptor) {
            expr.descriptor = descriptor;

            let result: Value;

            if (context.scope === ExprScope.Value && expr.isDynamic()) {
                if (expr.descriptor.partialEvaluate) {
                    return expr.descriptor.partialEvaluate(context, expr);
                }

                const args = expr.args.map(arg => {
                    return context.wrapValue(context.evaluate(arg));
                });

                if (args.every((arg, i) => arg === expr.args[i])) {
                    return expr;
                }

                result = new CallExpr(expr.op, args);
            } else {
                result = descriptor.call(context, expr);
            }

            return result;
        }

        throw new Error(`undefined operator '${expr.op}'`);
    }

    visitStepExpr(expr: StepExpr, context: ExprEvaluatorContext): Value {
        if (context.scope === ExprScope.Value) {
            const input = context.evaluate(expr.input);
            const defaultValue = context.evaluate(expr.defaultValue);
            return new StepExpr(
                context.wrapValue(input),
                context.wrapValue(defaultValue),
                expr.stops.map(([key, value]) => {
                    const v = context.evaluate(value);
                    return [key, context.wrapValue(v)];
                })
            );
        } else {
            const input = context.evaluate(expr.input);

            if (typeof input !== "number") {
                throw new Error(`input '${input}' must be a number`);
            }

            if (input < expr.stops[0][0]) {
                return context.evaluate(expr.defaultValue);
            }

            let index = expr.stops.findIndex(s => s[0] > input);

            if (index === -1) {
                index = expr.stops.length;
            }

            return context.evaluate(expr.stops[index - 1][1]);
        }
    }

    visitInterpolateExpr(expr: InterpolateExpr, context: ExprEvaluatorContext): Value {
        if (context.scope === ExprScope.Value) {
            const input = context.evaluate(expr.input);
            return new InterpolateExpr(
                expr.mode,
                context.wrapValue(input),
                expr.stops.map(([key, value]) => {
                    const v = context.evaluate(value);
                    return [key, context.wrapValue(v)];
                })
            );
        } else {
            const param = context.evaluate(expr.input);

            if (typeof param !== "number") {
                throw new Error(`input must be a number`);
            }

            if (expr.mode[0] === "cubic") {
                return cubicInterpolate(context, expr, param);
            }

            const keyIndex = expr.stops.findIndex(stop => stop[0] > param);

            if (keyIndex === -1) {
                // all the keys are smaller than the parameter
                return context.evaluate(expr.stops[expr.stops.length - 1][1]);
            } else if (keyIndex === 0) {
                return context.evaluate(expr.stops[0][1]);
            }

            const [key, value] = expr.stops[keyIndex];
            const [prevKey, prevValue] = expr.stops[keyIndex - 1];

            const v0 = promoteValue(context, prevValue);

            let t = 0;

            switch (expr.mode[0]) {
                case "discrete":
                    return v0;

                case "linear":
                    t = (param - prevKey) / (key - prevKey);
                    break;

                case "exponential": {
                    const base = expr.mode[1];
                    t =
                        base === 1
                            ? (param - prevKey) / (key - prevKey)
                            : (Math.pow(base, param - prevKey) - 1) /
                              (Math.pow(base, key - prevKey) - 1);

                    break;
                }

                default:
                    throw new Error(
                        `interpolation mode ${JSON.stringify(expr.mode)} is not supported`
                    );
            }

            const v1 = promoteValue(context, value);

            if (typeof v0 === "number" && typeof v1 === "number") {
                return THREE.MathUtils.lerp(v0, v1, t);
            } else if (v0 instanceof RGBA && v1 instanceof RGBA) {
                return v0.clone().lerp(v1, t);
            } else if (v0 instanceof Pixels && v1 instanceof Pixels) {
                return new Pixels(THREE.MathUtils.lerp(v0.value, v1.value, t));
            } else if (v0 instanceof THREE.Color && v1 instanceof THREE.Color) {
                return v0.clone().lerp(v1, t);
            } else if (v0 instanceof THREE.Vector2 && v1 instanceof THREE.Vector2) {
                return v0.clone().lerp(v1, t);
            } else if (v0 instanceof THREE.Vector3 && v1 instanceof THREE.Vector3) {
                return v0.clone().lerp(v1, t);
            } else if (v0 instanceof THREE.Vector4 && v1 instanceof THREE.Vector4) {
                return v0.clone().lerp(v1, t);
            } else if (Array.isArray(v0) && Array.isArray(v1) && v0.length === v1.length) {
                return v0.map((x, i) => THREE.MathUtils.lerp(x, (v1 as number[])[i], t));
            }

            throw new Error(`todo: mix(${JSON.stringify(v0)}, ${JSON.stringify(v1)}, ${t})`);
        }
    }
}

ExprEvaluator.defineOperators(CastOperators);
ExprEvaluator.defineOperators(ComparisonOperators);
ExprEvaluator.defineOperators(MathOperators);
ExprEvaluator.defineOperators(StringOperators);
ExprEvaluator.defineOperators(ColorOperators);
ExprEvaluator.defineOperators(TypeOperators);
ExprEvaluator.defineOperators(MiscOperators);
ExprEvaluator.defineOperators(FlowOperators);
ExprEvaluator.defineOperators(ArrayOperators);
ExprEvaluator.defineOperators(ObjectOperators);
ExprEvaluator.defineOperators(FeatureOperators);
ExprEvaluator.defineOperators(MapOperators);
ExprEvaluator.defineOperators(VectorOperators);
