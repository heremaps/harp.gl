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
    NumberLiteralExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";

import { CastOperators } from "./operators/CastOperators";
import { ComparisonOperators } from "./operators/ComparisonOperators";
import { MathOperators } from "./operators/MathOperators";
import { MiscOperators } from "./operators/MiscOperators";
import { StringOperators } from "./operators/StringOperators";
import { TypeOperators } from "./operators/TypeOperators";

export interface OperatorDescriptor {
    call: (actuals: Value[]) => Value;
}

export interface OperatorDescriptorMap {
    [name: string]: OperatorDescriptor;
}

const operatorDescriptors = new Map<string, OperatorDescriptor>();

/**
 * [[ExprEvaluator]] is used to evaluate [[Expr]] in a given environment.
 *
 * @hidden
 */
export class ExprEvaluator implements ExprVisitor<Value, Env> {
    static defineOperator(op: string, builtin: OperatorDescriptor) {
        operatorDescriptors.set(op, builtin);
    }

    static defineOperators(builtins: OperatorDescriptorMap) {
        Object.getOwnPropertyNames(builtins).forEach(p => {
            this.defineOperator(p, builtins[p]);
        });
    }

    /**
     * Evaluate `expr` in the given environment,
     *
     * @param expr The [[Expr]] to evaluate.
     * @param env The [[Env]] used to evaluate the expression.
     */
    evaluate(expr: Expr, env: Env): Value {
        return expr.accept(this, env);
    }

    visitVarExpr(expr: VarExpr, env: Env): Value {
        const value = env.lookup(expr.name);
        return value;
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, env: Env): Value {
        return expr.value;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, env: Env): Value {
        return expr.value;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, env: Env): Value {
        return expr.value;
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, env: Env): Value {
        return env.lookup(expr.attribute) !== undefined;
    }

    visitContainsExpr(expr: ContainsExpr, env: Env): Value {
        const value = this.evaluate(expr.value, env);
        return expr.elements.has(value);
    }

    visitCallExpr(expr: CallExpr, env: Env): Value {
        switch (expr.op) {
            case "all":
                for (const childExpr of expr.children) {
                    if (!this.evaluate(childExpr, env)) {
                        return false;
                    }
                }
                return true;

            case "any":
                for (const childExpr of expr.children) {
                    if (this.evaluate(childExpr, env)) {
                        return true;
                    }
                }
                return false;

            case "none":
                for (const childExpr of expr.children) {
                    if (this.evaluate(childExpr, env)) {
                        return false;
                    }
                }
                return true;

            case "boolean":
            case "number":
            case "string":
                for (const childExpr of expr.children) {
                    const value = this.evaluate(childExpr, env);
                    if (typeof value === expr.op) {
                        return value;
                    }
                }
                throw new Error(`expected a '${expr.op}'`);

            default: {
                const descriptor = operatorDescriptors.get(expr.op);
                if (descriptor) {
                    const actuals = expr.children.map(arg => this.evaluate(arg, env));
                    return descriptor.call(actuals);
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
