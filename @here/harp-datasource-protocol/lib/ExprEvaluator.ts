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
        throw new Error(`invalid operand '${value}' for operator 'length'`);
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
    call: ([left, right]) => left === right
});

ExprEvaluator.registerBuiltin("!=", {
    call: ([left, right]) => left !== right
});

ExprEvaluator.registerBuiltin("<", {
    call: ([left, right]) => {
        if (
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        ) {
            return left < right;
        }
        // tslint:disable-next-line: max-line-length
        throw new Error(`invalid operands '${left}' and '${right}' for operator '<'`);
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
        // tslint:disable-next-line: max-line-length
        throw new Error(`invalid operands '${left}' and '${right}' for operator '>'`);
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
        // tslint:disable-next-line: max-line-length
        throw new Error(`invalid operands '${left}' and '${right}' for operator '<='`);
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
        // tslint:disable-next-line: max-line-length
        throw new Error(`invalid operands '${left}' and '${right}' for operator '>='`);
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

ExprEvaluator.registerBuiltin("^", {
    call: (actuals: Value[]) => {
        const a = actuals[0];
        const b = actuals[1];
        if (typeof a !== "number" || typeof b !== "number") {
            // tslint:disable-next-line: max-line-length
            throw new Error(`invalid operands '${typeof a}' and '${typeof b}' for operator '^'`);
        }
        return Math.pow(a, b);
    }
});

ExprEvaluator.registerBuiltin("-", {
    call: (actuals: Value[]) => {
        const a = actuals[0];
        const b = actuals[1];
        if (typeof a !== "number" || typeof b !== "number") {
            // tslint:disable-next-line: max-line-length
            throw new Error(`invalid operands '${typeof a}' and '${typeof b}' for operator '-'`);
        }
        return a - b;
    }
});

ExprEvaluator.registerBuiltin("/", {
    call: (actuals: Value[]) => {
        const a = actuals[0];
        const b = actuals[1];
        if (typeof a !== "number" || typeof b !== "number") {
            // tslint:disable-next-line: max-line-length
            throw new Error(`invalid operands '${typeof a}' and '${typeof b}' for operator '/'`);
        }
        return a / b;
    }
});

ExprEvaluator.registerBuiltin("%", {
    call: (actuals: Value[]) => {
        const a = actuals[0];
        const b = actuals[1];
        if (typeof a !== "number" || typeof b !== "number") {
            // tslint:disable-next-line: max-line-length
            throw new Error(`invalid operands '${typeof a}' and '${typeof b}' for operator '%'`);
        }
        return a % b;
    }
});

ExprEvaluator.registerBuiltin("+", {
    call: (actuals: Value[]) => actuals.reduce((a, b) => Number(a) + Number(b), 0)
});

ExprEvaluator.registerBuiltin("*", {
    call: (actuals: Value[]) => actuals.reduce((a, b) => Number(a) * Number(b), 1)
});

ExprEvaluator.registerBuiltin("typeof", {
    call: (actuals: Value[]) => typeof actuals[0]
});

ExprEvaluator.registerBuiltin("abs", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'abs'`);
        }
        return Math.abs(value);
    }
});

ExprEvaluator.registerBuiltin("acos", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'acos'`);
        }
        return Math.acos(value);
    }
});

ExprEvaluator.registerBuiltin("asin", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'asin'`);
        }
        return Math.asin(value);
    }
});

ExprEvaluator.registerBuiltin("atan", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'atan'`);
        }
        return Math.atan(value);
    }
});

ExprEvaluator.registerBuiltin("ceil", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'ceil'`);
        }
        return Math.ceil(value);
    }
});

ExprEvaluator.registerBuiltin("cos", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'cos'`);
        }
        return Math.cos(value);
    }
});

ExprEvaluator.registerBuiltin("e", {
    call: () => {
        return Math.E;
    }
});

ExprEvaluator.registerBuiltin("floor", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'floor'`);
        }
        return Math.floor(value);
    }
});

ExprEvaluator.registerBuiltin("ln", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'ln'`);
        }
        return Math.log(value);
    }
});

ExprEvaluator.registerBuiltin("ln2", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'ln2'`);
        }
        return Math.log2(value);
    }
});

ExprEvaluator.registerBuiltin("log10", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'log10'`);
        }
        return Math.log10(value);
    }
});

ExprEvaluator.registerBuiltin("max", {
    call: (actuals: Value[]) => {
        return Math.max(...actuals.map(v => Number(v)));
    }
});

ExprEvaluator.registerBuiltin("min", {
    call: (actuals: Value[]) => {
        return Math.min(...actuals.map(v => Number(v)));
    }
});

ExprEvaluator.registerBuiltin("pi", {
    call: () => {
        return Math.PI;
    }
});

ExprEvaluator.registerBuiltin("round", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'round'`);
        }
        return Math.round(value);
    }
});

ExprEvaluator.registerBuiltin("sin", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'sin'`);
        }
        return Math.sin(value);
    }
});

ExprEvaluator.registerBuiltin("sqrt", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'sqrt'`);
        }
        return Math.sqrt(value);
    }
});

ExprEvaluator.registerBuiltin("tan", {
    call: (actuals: Value[]) => {
        const value = actuals[0];
        if (typeof value !== "number") {
            throw new Error(`invalid operand '${value}' for operator 'tan'`);
        }
        return Math.tan(value);
    }
});

ExprEvaluator.registerBuiltin("to-boolean", {
    call: (actuals: Value[]) => Boolean(actuals[0])
});

ExprEvaluator.registerBuiltin("to-number", {
    call: (actuals: Value[]) => Number(actuals[0])
});

ExprEvaluator.registerBuiltin("to-string", {
    call: (actuals: Value[]) => String(actuals[0])
});
