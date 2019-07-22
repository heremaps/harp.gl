/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExprEvaluator } from "./ExprEvaluator";
import { ExprParser } from "./ExprParser";

export interface ExprVisitor<Result, Context> {
    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: Context): Result;
    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: Context): Result;
    visitStringLiteralExpr(expr: StringLiteralExpr, context: Context): Result;
    visitVarExpr(expr: VarExpr, context: Context): Result;
    visitHasAttributeExpr(expr: HasAttributeExpr, context: Context): Result;
    visitContainsExpr(expr: ContainsExpr, context: Context): Result;
    visitCallExpr(expr: CallExpr, context: Context): Result;
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
            return Expr.parseCall(node);
        } else if (typeof node === "boolean") {
            return new BooleanLiteralExpr(node);
        } else if (typeof node === "number") {
            return new NumberLiteralExpr(node);
        } else if (typeof node === "string") {
            return new StringLiteralExpr(node);
        }
        throw new Error("failed to create expression");
    }

    private static parseCall(node: any[]): Expr {
        const op = node[0];

        if (typeof op !== "string") {
            throw new Error("expected a builtin function name");
        }

        switch (op) {
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

            default:
                return new CallExpr(op, node.slice(1).map(childExpr => this.fromJSON(childExpr)));
        } // switch
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

export class CallExpr extends Expr {
    constructor(readonly op: string, readonly children: Expr[]) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitCallExpr(this, context);
    }
}

class ExprSerializer implements ExprVisitor<unknown, void> {
    serialize(expr: Expr): unknown {
        return expr.accept(this, undefined);
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

    visitVarExpr(expr: VarExpr, context: void): unknown {
        return ["get", expr.name];
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: void): unknown {
        return ["has", expr.attribute];
    }

    visitContainsExpr(expr: ContainsExpr, context: void): unknown {
        return ["in", this.serialize(expr.value), expr.elements.map(e => this.serialize(e))];
    }

    visitCallExpr(expr: CallExpr, context: void): unknown {
        return [expr.op, ...expr.children.map(childExpr => this.serialize(childExpr))];
    }
}
