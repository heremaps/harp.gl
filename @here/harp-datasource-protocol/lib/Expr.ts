/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExprEvaluator, ExprEvaluatorContext, OperatorDescriptor } from "./ExprEvaluator";
import { ExprParser } from "./ExprParser";
import { ExprPool } from "./ExprPool";

const exprEvaluator = new ExprEvaluator();

export interface ExprVisitor<Result, Context> {
    visitNullLiteralExpr(expr: NullLiteralExpr, context: Context): Result;
    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: Context): Result;
    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: Context): Result;
    visitStringLiteralExpr(expr: StringLiteralExpr, context: Context): Result;
    visitVarExpr(expr: VarExpr, context: Context): Result;
    visitHasAttributeExpr(expr: HasAttributeExpr, context: Context): Result;
    visitContainsExpr(expr: ContainsExpr, context: Context): Result;
    visitCallExpr(expr: CallExpr, context: Context): Result;
    visitMatchExpr(expr: MatchExpr, context: Context): Result;
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
        } else if (node === null) {
            return NullLiteralExpr.instance;
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
                const elements = node[2];
                if (!Array.isArray(elements)) {
                    // tslint:disable-next-line: max-line-length
                    throw new Error(
                        `'${op}' expects an expression followed by an array of literals`
                    );
                }
                elements.forEach(element => {
                    if (typeof element === "object" || typeof element === "function") {
                        throw new Error("expected an array of constant values");
                    }
                });
                return new ContainsExpr(this.fromJSON(node[1]), elements);

            case "match":
                const value = this.fromJSON(node[1]);
                const conditions: Array<[MatchLabel, Expr]> = [];
                for (let i = 2; i < node.length - 1; i += 2) {
                    const label = node[i];
                    if (
                        !(
                            typeof label === "number" ||
                            typeof label === "string" ||
                            Array.isArray(label)
                        )
                    ) {
                        throw new Error(`parse error ${JSON.stringify(label)}`);
                    }
                    const expr = this.fromJSON(node[i + 1]);
                    conditions.push([label, expr]);
                }
                const fallback = this.fromJSON(node[node.length - 1]);
                return new MatchExpr(value, conditions, fallback);

            default:
                return new CallExpr(op, node.slice(1).map(childExpr => this.fromJSON(childExpr)));
        } // switch
    }

    /**
     * Evaluate an expression returning a [[Value]] object.
     *
     * @param env The [[Env]] used to lookup symbols.
     * @param cache A cache of previously computed results.
     */
    evaluate(env: Env, cache?: Map<Expr, Value>): Value | never {
        return this.accept(exprEvaluator, new ExprEvaluatorContext(exprEvaluator, env, cache));
    }

    /**
     * Create a unique object that is structurally equivalent to this [[Expr]].
     *
     * @param pool The [[ExprPool]] used to create a unique
     * equivalent object of this [[Expr]].
     */
    intern(pool: ExprPool): Expr {
        return pool.add(this);
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
export type Value = null | boolean | number | string;

/**
 * @hidden
 */
export class Env {
    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(_name: string): Value | undefined {
        return undefined;
    }

    /**
     * Return an object containing all properties of this environment. (Here: empty object).
     */
    unmap(): ValueMap {
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
    lookup(name: string): Value | undefined {
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
    unmap(): ValueMap {
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
 * @hidden
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
 * Null literal expression.
 * @hidden
 */
export class NullLiteralExpr extends Expr {
    static instance = new NullLiteralExpr();

    protected constructor() {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitNullLiteralExpr(this, context);
    }
}

/**
 * Boolean literal expression.
 * @hidden
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
 * @hidden
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
 * @hidden
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
 * @hidden
 */
export class HasAttributeExpr extends Expr {
    constructor(readonly name: string) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitHasAttributeExpr(this, context);
    }
}

/**
 * A contains expression.
 * @hidden
 */
export class ContainsExpr extends Expr {
    constructor(readonly value: Expr, readonly elements: Value[]) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitContainsExpr(this, context);
    }
}

/**
 * @hidden
 */
export class CallExpr extends Expr {
    descriptor?: OperatorDescriptor;

    constructor(readonly op: string, readonly children: Expr[]) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitCallExpr(this, context);
    }
}

type MatchLabel = number | string | number[] | string[];

/**
 * @hidden
 */
export class MatchExpr extends Expr {
    constructor(
        readonly value: Expr,
        readonly branches: Array<[MatchLabel, Expr]>,
        readonly fallback: Expr
    ) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitMatchExpr(this, context);
    }
}

/**
 * @hidden
 */
class ExprSerializer implements ExprVisitor<unknown, void> {
    serialize(expr: Expr): unknown {
        return expr.accept(this, undefined);
    }

    visitNullLiteralExpr(expr: NullLiteralExpr, context: void): unknown {
        return null;
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
        return ["has", expr.name];
    }

    visitContainsExpr(expr: ContainsExpr, context: void): unknown {
        return ["in", this.serialize(expr.value), expr.elements];
    }

    visitCallExpr(expr: CallExpr, context: void): unknown {
        return [expr.op, ...expr.children.map(childExpr => this.serialize(childExpr))];
    }

    visitMatchExpr(expr: MatchExpr, context: void): unknown {
        const branches: unknown[] = [];
        for (const [label, body] of expr.branches) {
            branches.push(label, this.serialize(body));
        }
        return ["match", this.serialize(expr.value), ...branches, this.serialize(expr.fallback)];
    }
}
