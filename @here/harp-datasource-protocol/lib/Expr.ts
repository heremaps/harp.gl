/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExprEvaluator } from "./ExprEvaluator";
import { ExprParser } from "./ExprParser";

export interface ExprVisitor<Result, Context> {
    visitVarExpr(expr: VarExpr, context: Context): Result;
    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: Context): Result;
    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: Context): Result;
    visitStringLiteralExpr(expr: StringLiteralExpr, context: Context): Result;
    visitHasAttributeExpr(expr: HasAttributeExpr, context: Context): Result;
    visitLengthExpr(expr: LengthExpr, context: Context): Result;
    visitContainsExpr(expr: ContainsExpr, context: Context): Result;
    visitNotExpr(expr: NotExpr, context: Context): Result;
    visitBinaryExpr(expr: BinaryExpr, context: Context): Result;
    visitLogicalExpr(expr: LogicalExpr, context: Context): Result;
}

/**
 * Abstract class defining a shape of a [[Theme]]'s expression
 */
export abstract class Expr {
    /**
     * Creates an expression from the given `code`.
     *
     * @param code The code to parse.
     * @returns The parsed [[Expr]].
     */
    static parse(code: string): Expr | never {
        const parser = new ExprParser(code);
        const expr = parser.parse();
        return expr;
    }

    static fromJSON(node: unknown): Expr {
        if (Array.isArray(node)) {
            const op = node[0] as Op;
            switch (op) {
                case "all": {
                    if (node.length < 2) {
                        throw new Error(`'${op}' expectes a sequence of child expressions`);
                    }
                    let current: Expr = this.fromJSON(node[1]);
                    for (let i = 2; i < node.length; ++i) {
                        current = new LogicalExpr("&&", current, this.fromJSON(node[i]));
                    }
                    return current;
                }

                case "any": {
                    if (node.length < 2) {
                        throw new Error(`'${op}' expectes a sequence of child expressions`);
                    }
                    let current: Expr = this.fromJSON(node[1]);
                    for (let i = 2; i < node.length; ++i) {
                        current = new LogicalExpr("||", current, this.fromJSON(node[i]));
                    }
                    return current;
                }

                case "get":
                    if (typeof node[1] !== "string") {
                        throw new Error(`expected the name of an attribute`);
                    }
                    return new VarExpr(node[1]);

                case "has":
                    if (typeof node[1] !== "string") {
                        throw new Error(`expected the name of an attribute`);
                    }
                    return new HasAttributeExpr(node[1]);

                case "length":
                    if (node.length !== 2) {
                        throw new Error(`'${op}' expects a child expression`);
                    }
                    return new LengthExpr(this.fromJSON(node[1]));

                case "in":
                    if (!Array.isArray(node[2])) {
                        // tslint:disable-next-line: max-line-length
                        throw new Error(
                            `'${op}' expects an expression followed by an array of literals`
                        );
                    }
                    return new ContainsExpr(
                        this.fromJSON(node[1]),
                        node[2].map((n: unknown) => this.fromJSON(n))
                    );

                case "!":
                    if (node.length !== 2) {
                        throw new Error(`'${op}' expects a child expression`);
                    }
                    return new NotExpr(this.fromJSON(node[1]));

                case "<":
                case ">":
                case "<=":
                case ">=":
                case "~=":
                case "^=":
                case "$=":
                case "==":
                case "!=":
                    if (node.length !== 3) {
                        throw new Error(`'${op}' expectes two child expressions`);
                    }
                    return new BinaryExpr(
                        op as any,
                        this.fromJSON(node[1]),
                        this.fromJSON(node[2])
                    );
            } // switch
        } else if (typeof node === "boolean") {
            return new BooleanLiteralExpr(node);
        } else if (typeof node === "number") {
            return new NumberLiteralExpr(node);
        } else if (typeof node === "string") {
            return new StringLiteralExpr(node);
        }
        throw new Error("failed to create expression");
    }

    /**
     * Evaluate an expression returning a [[Value]] object.
     */
    evaluate(env: Env): Value | never {
        const e = new ExprEvaluator();
        return e.evaluate(this, env);
    }

    toJSON(): unknown {
        return new ExprSerializer().serialize(this);
    }

    abstract accept<Result, Context>(
        visitor: ExprVisitor<Result, Context>,
        context: Context
    ): Result;
}

/**
 * @hidden
 */
export type RelationalOp = "<" | ">" | "<=" | ">=";

/**
 * @hidden
 */
export type EqualityOp = "~=" | "^=" | "$=" | "==" | "!=";

/**
 * @hidden
 */
export type BinaryOp = RelationalOp | EqualityOp;

/**
 * @hidden
 */
export type LogicalOp = "&&" | "||";

/**
 * @hidden
 */
export type Value = undefined | boolean | number | string;

/**
 * @hidden
 */
export class Env {
    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(_name: string): Value {
        return undefined;
    }

    /**
     * Return an object containing all properties of this environment. (Here: empty object).
     */
    unmap(): any {
        return {};
    }
}

/**
 * @hidden
 */
export interface ValueMap {
    [name: string]: Value;
}

/**
 * Adds access to map specific environment properties.
 */
export class MapEnv extends Env {
    constructor(readonly entries: ValueMap, private readonly parent?: Env) {
        super();
    }

    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(name: string): Value {
        if (this.entries.hasOwnProperty(name)) {
            const value = this.entries[name];

            if (value !== undefined) {
                return value;
            }
        }

        return this.parent ? this.parent.lookup(name) : undefined;
    }

    /**
     * Return an object containing all properties of this environment, takes care of the parent
     * object.
     */
    unmap(): any {
        const obj: any = this.parent ? this.parent.unmap() : {};

        for (const key in this.entries) {
            if (this.entries.hasOwnProperty(key)) {
                obj[key] = this.entries[key];
            }
        }
        return obj;
    }
}

/**
 * Var expression.
 */
export class VarExpr extends Expr {
    constructor(readonly name: string) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitVarExpr(this, context);
    }
}

/**
 * Boolean literal expression.
 */
export class BooleanLiteralExpr extends Expr {
    constructor(readonly value: boolean) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitBooleanLiteralExpr(this, context);
    }
}

/**
 * Number literal expression.
 */
export class NumberLiteralExpr extends Expr {
    constructor(readonly value: number) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitNumberLiteralExpr(this, context);
    }
}

/**
 * String literal expression.
 */
export class StringLiteralExpr extends Expr {
    constructor(readonly value: string) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitStringLiteralExpr(this, context);
    }
}

/**
 * A has expression with an attribute, for example `has(ref)`.
 */
export class HasAttributeExpr extends Expr {
    constructor(readonly attribute: string) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitHasAttributeExpr(this, context);
    }
}

/**
 * A contains expression.
 */
export class ContainsExpr extends Expr {
    constructor(readonly value: Expr, readonly elements: Expr[]) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitContainsExpr(this, context);
    }
}

/**
 * A 'length' expression with an attribute given, for example `length(ref)`.
 *
 * Measures the length of the string (number of letters) or counts digits in numerical data type.
 * For boolean data types always returns 1.
 */
export class LengthExpr extends Expr {
    constructor(readonly childExpr: Expr) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitLengthExpr(this, context);
    }
}

/**
 * A `not` expression.
 */
export class NotExpr extends Expr {
    constructor(readonly childExpr: Expr) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitNotExpr(this, context);
    }
}

/**
 * A binary operator expression
 */
export class BinaryExpr extends Expr {
    constructor(readonly op: BinaryOp, readonly left: Expr, readonly right: Expr) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitBinaryExpr(this, context);
    }
}

/**
 * Logical expression.
 */
export class LogicalExpr extends Expr {
    constructor(readonly op: LogicalOp, readonly left: Expr, readonly right: Expr) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitLogicalExpr(this, context);
    }
}

type Op = "all" | "any" | "get" | "has" | "length" | "in" | "!" | BinaryOp;

class ExprSerializer implements ExprVisitor<unknown, void> {
    serialize(expr: Expr): unknown {
        return expr.accept(this, undefined);
    }

    visitVarExpr(expr: VarExpr, context: void): unknown {
        return ["get", expr.name];
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: void): unknown {
        return expr.value;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: void): unknown {
        return expr.value;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, context: void): unknown {
        return expr.value;
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: void): unknown {
        return ["has", expr.attribute];
    }

    visitContainsExpr(expr: ContainsExpr, context: void): unknown {
        return ["in", this.serialize(expr.value), expr.elements.map(e => this.serialize(e))];
    }

    visitLengthExpr(expr: LengthExpr, context: void): unknown {
        return ["length", this.serialize(expr.childExpr)];
    }

    visitNotExpr(expr: NotExpr, context: void): unknown {
        return ["!", this.serialize(expr.childExpr)];
    }

    visitBinaryExpr(expr: BinaryExpr, context: void): unknown {
        return [expr.op, this.serialize(expr.left), this.serialize(expr.right)];
    }

    visitLogicalExpr(expr: LogicalExpr, context: void): unknown {
        const result: unknown[] = [this.convertLogicalOp(expr.op)];
        this.unfold(expr.left, expr.op, result);
        this.unfold(expr.right, expr.op, result);
        return result;
    }

    private convertLogicalOp(op: LogicalOp): string | never {
        switch (op) {
            case "&&":
                return "all";
            case "||":
                return "any";
            default:
                throw new Error(`invalid logical op '${op}'`);
        }
    }

    private unfold(e: Expr, op: LogicalOp, exprs: unknown[]) {
        if (e instanceof LogicalExpr && e.op === op) {
            this.unfold(e.left, op, exprs);
            this.unfold(e.right, op, exprs);
        } else {
            exprs.push(e);
        }
    }
}
