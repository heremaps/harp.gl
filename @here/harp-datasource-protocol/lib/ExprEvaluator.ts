/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BooleanLiteralExpr,
    CallExpr,
    ContainsExpr,
    Env,
    Expr,
    ExprVisitor,
    HasAttributeExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    StringLiteralExpr,
    Value,
    VarExpr,
    CaseExpr
} from "./Expr";

import { CastOperators } from "./operators/CastOperators";
import { ComparisonOperators } from "./operators/ComparisonOperators";
import { FlowOperators } from "./operators/FlowOperators";
import { MathOperators } from "./operators/MathOperators";
import { MiscOperators } from "./operators/MiscOperators";
import { StringOperators } from "./operators/StringOperators";
import { TypeOperators } from "./operators/TypeOperators";

export interface OperatorDescriptor {
    call: (context: ExprEvaluatorContext, args: Expr[]) => Value;
}

export interface OperatorDescriptorMap {
    [name: string]: OperatorDescriptor;
}

const operatorDescriptors = new Map<string, OperatorDescriptor>();

/*
 * @hidden
 */
export class ExprEvaluatorContext {
    constructor(
        readonly evaluator: ExprEvaluator,
        readonly env: Env,
        readonly cache?: Map<Expr, Value>
    ) {}

    evaluate(expr: Expr | undefined) {
        if (expr !== undefined) {
            return expr.accept(this.evaluator, this);
        }
        throw new Error("Failed to evaluate expression");
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

    visitHasAttributeExpr(expr: HasAttributeExpr, context: ExprEvaluatorContext): Value {
        return context.env.lookup(expr.name) !== undefined;
    }

    visitContainsExpr(expr: ContainsExpr, context: ExprEvaluatorContext): Value {
        const value = expr.value.accept(this, context);

        const result = expr.elements.includes(value);

        if (context.cache !== undefined) {
            context.cache.set(expr, result);
        }

        return result;
    }

    visitMatchExpr(match: MatchExpr, context: ExprEvaluatorContext): Value {
        const r = context.evaluate(match.value);
        for (const [label, body] of match.branches) {
            if (Array.isArray(label) && label.includes(r as any)) {
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
        switch (expr.op) {
            case "all":
                for (const childExpr of expr.children) {
                    if (!childExpr.accept(this, context)) {
                        return false;
                    }
                }
                return true;

            case "any":
                for (const childExpr of expr.children) {
                    if (childExpr.accept(this, context)) {
                        return true;
                    }
                }
                return false;

            case "none":
                for (const childExpr of expr.children) {
                    if (childExpr.accept(this, context)) {
                        return false;
                    }
                }
                return true;

            default: {
                if (context.cache !== undefined) {
                    const v = context.cache.get(expr);
                    if (v !== undefined) {
                        return v;
                    }
                }

                const descriptor = expr.descriptor || operatorDescriptors.get(expr.op);

                if (descriptor) {
                    expr.descriptor = descriptor;

                    const result = descriptor.call(context, expr.children);

                    if (context.cache) {
                        context.cache.set(expr, result);
                    }

                    return result;
                }

                throw new Error(`undefined operator '${expr.op}`);
            }
        } // switch
    }
}

ExprEvaluator.defineOperators(CastOperators);
ExprEvaluator.defineOperators(ComparisonOperators);
ExprEvaluator.defineOperators(MathOperators);
ExprEvaluator.defineOperators(StringOperators);
ExprEvaluator.defineOperators(TypeOperators);
ExprEvaluator.defineOperators(MiscOperators);
ExprEvaluator.defineOperators(FlowOperators);
