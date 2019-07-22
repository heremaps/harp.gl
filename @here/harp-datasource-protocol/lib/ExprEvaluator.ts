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

export interface BuiltinDescriptor {
    // ### TODO: typed signature
    call: (actuals: Value[]) => Value;
}

const builtinFunctions = new Map<string, BuiltinDescriptor>();

/**
 * [[ExprEvaluator]] is used to evaluate [[Expr]] in a given environment.
 *
 * @hidden
 */
export class ExprEvaluator implements ExprVisitor<Value, Env> {
    static registerBuiltin(op: string, builtin: BuiltinDescriptor) {
        builtinFunctions.set(op, builtin);
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
        for (const e of expr.elements) {
            const element = this.evaluate(e, env);
            if (value === element) {
                return true;
            }
        }
        return false;
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

            default: {
                const descriptor = builtinFunctions.get(expr.op);
                if (descriptor) {
                    const actuals = expr.children.map(arg => this.evaluate(arg, env));
                    return descriptor.call(actuals);
                }
                throw new Error(`undefined operator '${expr.op}`);
            }
        } // switch
    }
}

ExprEvaluator.registerBuiltin("length", {
    call: actuals => {
        const value = actuals[0];
        if (Array.isArray(value) || typeof value === "string") {
            return value.length;
        }
        return undefined;
    }
});

ExprEvaluator.registerBuiltin("!", {
    call: actuals => !actuals[0]
});

ExprEvaluator.registerBuiltin("~=", {
    call: ([left, right]) => {
        if (typeof left === "string" && typeof right === "string") {
            return left.indexOf(right) !== -1;
        }
        return false;
    }
});

ExprEvaluator.registerBuiltin("^=", {
    call: ([left, right]) => {
        if (typeof left === "string" && typeof right === "string") {
            return left.startsWith(right);
        }
        return false;
    }
});

ExprEvaluator.registerBuiltin("$=", {
    call: ([left, right]) => {
        if (typeof left === "string" && typeof right === "string") {
            return left.endsWith(right);
        }
        return false;
    }
});

ExprEvaluator.registerBuiltin("==", {
    call: ([left, right]) => {
        if (typeof left === typeof right) {
            return left === right;
        }
        throw new Error(`invalid call ["==", ${typeof left}, ${typeof right}]`);
    }
});

ExprEvaluator.registerBuiltin("!=", {
    call: ([left, right]) => {
        if (typeof left === typeof right) {
            return left !== right;
        }
        throw new Error(`invalid call ["!=", ${typeof left}, ${typeof right}]`);
    }
});

ExprEvaluator.registerBuiltin("<", {
    call: ([left, right]) => {
        if (
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        ) {
            return left < right;
        }
        throw new Error(`invalid call ["<", ${typeof left}, ${typeof right}]`);
    }
});

ExprEvaluator.registerBuiltin(">", {
    call: ([left, right]) => {
        if (
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        ) {
            return left > right;
        }
        throw new Error(`invalid call [">", ${typeof left}, ${typeof right}]`);
    }
});

ExprEvaluator.registerBuiltin("<=", {
    call: ([left, right]) => {
        if (
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        ) {
            return left <= right;
        }
        throw new Error(`invalid call ["<=", ${typeof left}, ${typeof right}]`);
    }
});

ExprEvaluator.registerBuiltin(">=", {
    call: ([left, right]) => {
        if (
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        ) {
            return left >= right;
        }
        throw new Error(`invalid call [">=", ${typeof left}, ${typeof right}]`);
    }
});

ExprEvaluator.registerBuiltin("concat", {
    call: (actuals: unknown[]) => {
        return "".concat(...actuals.map(a => String(a)));
    }
});

ExprEvaluator.registerBuiltin("downcase", {
    call: (actuals: unknown[]) => {
        return String(actuals[0]).toLocaleLowerCase();
    }
});

ExprEvaluator.registerBuiltin("upcase", {
    call: (actuals: unknown[]) => {
        return String(actuals[0]).toLocaleUpperCase();
    }
});

ExprEvaluator.registerBuiltin("+", {
    call: (actuals: Value[]) => {
        return actuals.reduce((a, b) => Number(a) + Number(b), 0);
    }
});

ExprEvaluator.registerBuiltin("*", {
    call: (actuals: Value[]) => {
        return actuals.reduce((a, b) => Number(a) * Number(b), 1);
    }
});
