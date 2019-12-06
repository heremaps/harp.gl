/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BooleanLiteralExpr,
    CallExpr,
    CaseExpr,
    ContainsExpr,
    Env,
    Expr,
    ExprScope,
    ExprVisitor,
    HasAttributeExpr,
    LiteralExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
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
import { InterpolationOperators } from "./operators/InterpolationOperators";
import { MapOperators } from "./operators/MapOperators";
import { MathOperators } from "./operators/MathOperators";
import { MiscOperators } from "./operators/MiscOperators";
import { ObjectOperators } from "./operators/ObjectOperators";
import { StringOperators } from "./operators/StringOperators";
import { TypeOperators } from "./operators/TypeOperators";

export interface OperatorDescriptor {
    /**
     * Returns `true` if this operator requires a dynamic execution context (e.g. ["zoom"]).
     */
    isDynamicOperator?: (call: CallExpr) => boolean;

    /**
     * Evaluates the given expression.
     */
    call: (context: ExprEvaluatorContext, call: CallExpr) => Value;
}

export interface OperatorDescriptorMap {
    [name: string]: OperatorDescriptor;
}

const operatorDescriptors = new Map<string, OperatorDescriptor>();

/*
 * @hidden
 */
export class ExprEvaluatorContext {
    private m_partialEvaluation = false;

    constructor(
        readonly evaluator: ExprEvaluator,
        readonly env: Env,
        readonly scope: ExprScope,
        readonly cache?: Map<Expr, Value>
    ) {}

    /**
     * `true` if the this context is used to partially evaluate expressions.
     */
    get partialEvaluation() {
        return this.m_partialEvaluation;
    }

    /**
     * Evaluate the given expression.
     *
     * @param expr The [[Expr]] to evaluate.
     */
    evaluate(expr: Expr | undefined) {
        if (expr !== undefined) {
            return expr.accept(this.evaluator, this);
        }
        throw new Error("Failed to evaluate expression");
    }

    /**
     * Partially evaluate the given expression.
     *
     * @param expr The [[Expr]] to evaluate.
     */
    partiallyEvaluate(expr: Expr | undefined): Expr {
        if (expr === undefined) {
            throw new Error("Failed to evaluate expression");
        }

        const previousEvaluationMode = this.m_partialEvaluation;

        this.m_partialEvaluation = true;

        try {
            const value = expr.accept(this.evaluator, this);

            this.m_partialEvaluation = previousEvaluationMode;

            if (value instanceof Expr) {
                return value;
            }

            return LiteralExpr.fromValue(value);
        } catch (error) {
            // rethrow the exception
            throw error;
        } finally {
            // reset the evaluation mode.
            this.m_partialEvaluation = previousEvaluationMode;
        }
    }
}

/**
 * [[ExprEvaluator]] is used to evaluate [[Expr]] in a given environment.
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

    visitContainsExpr(expr: ContainsExpr, context: ExprEvaluatorContext): Value {
        const value = expr.value.accept(this, context);

        const result = expr.elements.includes(value as any);

        if (context.cache !== undefined) {
            context.cache.set(expr, result);
        }

        return result;
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
        for (const [condition, body] of match.branches) {
            if (context.evaluate(condition)) {
                return context.evaluate(body);
            }
        }
        return context.evaluate(match.fallback);
    }

    visitCallExpr(expr: CallExpr, context: ExprEvaluatorContext): Value {
        if (context.cache !== undefined) {
            const v = context.cache.get(expr);
            if (v !== undefined) {
                return v;
            }
        }

        const descriptor = expr.descriptor || operatorDescriptors.get(expr.op);

        if (descriptor) {
            expr.descriptor = descriptor;

            const result = descriptor.call(context, expr);

            if (context.cache) {
                context.cache.set(expr, result);
            }

            return result;
        }

        throw new Error(`undefined operator '${expr.op}`);
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
ExprEvaluator.defineOperators(InterpolationOperators);
ExprEvaluator.defineOperators(ObjectOperators);
ExprEvaluator.defineOperators(FeatureOperators);
ExprEvaluator.defineOperators(MapOperators);
