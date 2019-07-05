/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BinaryExpr,
    BooleanLiteralExpr,
    ContainsExpr,
    Env,
    Expr,
    ExprVisitor,
    HasAttributeExpr,
    LengthExpr,
    LogicalExpr,
    NotExpr,
    NumberLiteralExpr,
    StringLiteralExpr,
    Value,
    VarExpr
} from "./Expr";

/**
 * [[ExprEvaluator]] is used to evaluate [[Expr]] in a given environment.
 *
 * @hidden
 */
export class ExprEvaluator implements ExprVisitor<Value, Env> {
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
        for (const e of expr.elements) {
            const element = this.evaluate(e, env);
            if (value === element) {
                return true;
            }
        }
        return false;
    }

    visitNotExpr(expr: NotExpr, env: Env): Value {
        return !this.evaluate(expr.childExpr, env);
    }

    visitLengthExpr(expr: LengthExpr, env: Env): Value {
        const value = this.evaluate(expr.childExpr, env);
        if (Array.isArray(value) || typeof value === "string") {
            return value.length;
        }
        return undefined;
    }

    visitBinaryExpr(expr: BinaryExpr, env: Env): Value {
        const left = this.evaluate(expr.left, env);
        const right = this.evaluate(expr.right, env);
        switch (expr.op) {
            case "~=": {
                if (typeof left === "string" && typeof right === "string") {
                    return left.indexOf(right) !== -1;
                }
                return false;
            }
            case "^=": {
                if (typeof left === "string" && typeof right === "string") {
                    return left.startsWith(right);
                }
                return false;
            }
            case "$=": {
                if (typeof left === "string" && typeof right === "string") {
                    return left.endsWith(right);
                }
                return false;
            }
            case "==":
                return left === right;
            case "!=":
                return left !== right;
            case "<":
                return left !== undefined && right !== undefined ? left < right : undefined;
            case ">":
                return left !== undefined && right !== undefined ? left > right : undefined;
            case "<=":
                return left !== undefined && right !== undefined ? left <= right : undefined;
            case ">=":
                return left !== undefined && right !== undefined ? left >= right : undefined;
        }
        throw new Error(`invalid relational op '${expr.op}'`);
    }

    visitLogicalExpr(expr: LogicalExpr, env: Env): Value {
        const value = this.evaluate(expr.left, env);
        switch (expr.op) {
            case "||":
                return value || this.evaluate(expr.right, env);
            case "&&":
                return value && this.evaluate(expr.right, env);
        } // switch
        throw new Error(`invalid logical op '${expr.op}'`);
    }
}
