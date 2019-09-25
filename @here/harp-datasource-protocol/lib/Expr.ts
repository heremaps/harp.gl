/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExprEvaluator, ExprEvaluatorContext, OperatorDescriptor } from "./ExprEvaluator";
import { ExprParser } from "./ExprParser";
import { ExprPool } from "./ExprPool";
import { isInterpolatedPropertyDefinition } from "./InterpolatedProperty";
import { Definitions, isSelectorDefinition, isValueDefinition } from "./Theme";

const exprEvaluator = new ExprEvaluator();

export interface ExprVisitor<Result, Context> {
    visitNullLiteralExpr(expr: NullLiteralExpr, context: Context): Result;
    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: Context): Result;
    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: Context): Result;
    visitStringLiteralExpr(expr: StringLiteralExpr, context: Context): Result;
    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: Context): Result;
    visitVarExpr(expr: VarExpr, context: Context): Result;
    visitHasAttributeExpr(expr: HasAttributeExpr, context: Context): Result;
    visitContainsExpr(expr: ContainsExpr, context: Context): Result;
    visitCallExpr(expr: CallExpr, context: Context): Result;
    visitMatchExpr(expr: MatchExpr, context: Context): Result;
    visitCaseExpr(expr: CaseExpr, context: Context): Result;
}

export type JsonExpr = unknown[];

export function isJsonExpr(v: any): v is JsonExpr {
    return Array.isArray(v) && v.length > 0 && typeof v[0] === "string";
}

/**
 * Internal state needed by [[Expr.fromJSON]] to resolve `"ref"` expressions.
 * @hidden
 */
interface ReferenceResolverState {
    definitions: Definitions;
    lockedNames: Set<string>;
    cache: Map<string, Expr>;
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

    /**
     * Parse expression in JSON form.
     *
     * If `definitions` are defined, then references (`['ref', name]`) are resolved.
     *
     * Pass `definitionExprCache` to reuse `Expr` instances created from definitions across
     * many `fromJSON` calls.
     *
     * @param node expression in JSON format to parse
     * @param definitions optional set of definitions needed definition resolved by `ref` operator
     * @param definitionExprCache optional cache of `Expr` instances derived from `definitions`
     */
    static fromJSON(
        node: unknown,
        definitions?: Definitions,
        definitionExprCache?: Map<string, Expr>
    ) {
        const referenceResolverState: ReferenceResolverState | undefined =
            definitions !== undefined
                ? {
                      definitions,
                      lockedNames: new Set(),
                      cache: definitionExprCache || new Map<string, Expr>()
                  }
                : undefined;

        return Expr.parseNode(node, referenceResolverState);
    }

    private static parseNode(
        node: unknown,
        referenceResolverState: ReferenceResolverState | undefined
    ): Expr {
        if (Array.isArray(node)) {
            return Expr.parseCall(node, referenceResolverState);
        } else if (node === null) {
            return NullLiteralExpr.instance;
        } else if (typeof node === "boolean") {
            return new BooleanLiteralExpr(node);
        } else if (typeof node === "number") {
            return new NumberLiteralExpr(node);
        } else if (typeof node === "string") {
            return new StringLiteralExpr(node);
        }
        throw new Error(`failed to create expression from: ${JSON.stringify(node)}`);
    }

    private static parseCall(node: any[], referenceResolverState?: ReferenceResolverState): Expr {
        const op = node[0];

        if (typeof op !== "string") {
            throw new Error("expected a builtin function name");
        }

        switch (op) {
            case "!has":
            case "!in":
                return new CallExpr("!", [this.parseCall([op.slice(1), ...node.slice(1)])]);

            case "get":
                if (node[2] !== undefined) {
                    return Expr.makeCallExpr(op, node, referenceResolverState);
                }
                if (typeof node[1] !== "string") {
                    throw new Error(`expected the name of an attribute`);
                }
                return new VarExpr(node[1]);

            case "ref":
                return this.resolveReference(node, referenceResolverState);

            case "has":
                if (node[2] !== undefined) {
                    return Expr.makeCallExpr(op, node, referenceResolverState);
                }
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
                return new ContainsExpr(this.parseNode(node[1], referenceResolverState), elements);

            case "literal":
                if (typeof node[1] !== "object") {
                    throw new Error("expected an object or array literal");
                }
                return new ObjectLiteralExpr(node[1]);

            case "match": {
                if (node.length < 4) {
                    throw new Error("not enough arguments");
                }
                if (!(node.length % 2)) {
                    throw new Error("fallback is missing in 'match' expression");
                }
                const value = this.parseNode(node[1], referenceResolverState);
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
                    const expr = this.parseNode(node[i + 1], referenceResolverState);
                    conditions.push([label, expr]);
                }
                const fallback = this.parseNode(node[node.length - 1], referenceResolverState);
                return new MatchExpr(value, conditions, fallback);
            }

            case "case": {
                if (node.length < 3) {
                    throw new Error("not enough arguments");
                }
                if (node.length % 2) {
                    throw new Error("fallback is missing in 'case' expression");
                }
                const branches: Array<[Expr, Expr]> = [];
                for (let i = 1; i < node.length - 1; i += 2) {
                    const condition = this.parseNode(node[i], referenceResolverState);
                    const expr = this.parseNode(node[i + 1], referenceResolverState);
                    branches.push([condition, expr]);
                }
                const caseFallback = this.parseNode(node[node.length - 1], referenceResolverState);
                return new CaseExpr(branches, caseFallback);
            }

            default:
                return this.makeCallExpr(op, node, referenceResolverState);
        } // switch
    }

    private static makeCallExpr(
        op: string,
        node: any[],
        referenceResolverState?: ReferenceResolverState
    ): Expr {
        return new CallExpr(
            op,
            node.slice(1).map(childExpr => this.parseNode(childExpr, referenceResolverState))
        );
    }

    private static resolveReference(node: any[], referenceResolverState?: ReferenceResolverState) {
        if (typeof node[1] !== "string") {
            throw new Error(`expected the name of an attribute`);
        }
        if (referenceResolverState === undefined) {
            throw new Error(`ref used with no definitions`);
        }
        const name = node[1] as string;

        if (referenceResolverState.lockedNames.has(name)) {
            throw new Error(`circular referene to '${name}'`);
        }

        if (!(name in referenceResolverState.definitions)) {
            throw new Error(`definition '${name}' not found`);
        }

        const cachedEntry = referenceResolverState.cache.get(name);
        if (cachedEntry !== undefined) {
            return cachedEntry;
        }
        let definitionEntry = referenceResolverState.definitions[name] as any;
        if (isSelectorDefinition(definitionEntry)) {
            definitionEntry = definitionEntry.value;
        }
        let result: Expr;
        if (isValueDefinition(definitionEntry)) {
            if (isInterpolatedPropertyDefinition(definitionEntry.value)) {
                return new ObjectLiteralExpr(definitionEntry.value);
            } else if (isJsonExpr(definitionEntry.value)) {
                definitionEntry = definitionEntry.value;
            } else {
                return Expr.fromJSON(definitionEntry.value);
            }
        }
        if (isJsonExpr(definitionEntry)) {
            referenceResolverState.lockedNames.add(name);
            try {
                result = Expr.parseNode(definitionEntry, referenceResolverState);
            } finally {
                referenceResolverState.lockedNames.delete(name);
            }
        } else {
            throw new Error(`unsupported definition ${name}`);
        }
        referenceResolverState.cache.set(name, result);
        return result;
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
export type Value = null | boolean | number | string | object;

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

export abstract class LiteralExpr extends Expr {
    abstract get value(): Value;
}

/**
 * Null literal expression.
 * @hidden
 */
export class NullLiteralExpr extends Expr {
    static instance = new NullLiteralExpr();
    readonly value = null;

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
export class BooleanLiteralExpr extends LiteralExpr {
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
export class NumberLiteralExpr extends LiteralExpr {
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
export class StringLiteralExpr extends LiteralExpr {
    constructor(readonly value: string) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitStringLiteralExpr(this, context);
    }
}

/**
 * Object literal expression.
 * @hidden
 */
export class ObjectLiteralExpr extends LiteralExpr {
    constructor(readonly value: object) {
        super();
    }

    get isArrayLiteral() {
        return Array.isArray(this.value);
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitObjectLiteralExpr(this, context);
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
export class CaseExpr extends Expr {
    constructor(readonly branches: Array<[Expr, Expr]>, readonly fallback: Expr) {
        super();
    }

    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitCaseExpr(this, context);
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

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: void): unknown {
        return ["literal", expr.value];
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

    visitCaseExpr(expr: CaseExpr, context: void): unknown {
        const branches: unknown[] = [];
        for (const [condition, body] of expr.branches) {
            branches.push(this.serialize(condition), this.serialize(body));
        }
        return ["case", ...branches, this.serialize(expr.fallback)];
    }
}
