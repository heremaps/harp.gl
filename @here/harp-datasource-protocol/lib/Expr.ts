/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Env, Value } from "./Env";
import { ExprEvaluator, ExprEvaluatorContext, OperatorDescriptor } from "./ExprEvaluator";
import { ExprInstantiator, InstantiationContext } from "./ExprInstantiator";
import { ExprParser } from "./ExprParser";
import { ExprPool } from "./ExprPool";
import {
    interpolatedPropertyDefinitionToJsonExpr,
    isInterpolatedPropertyDefinition
} from "./InterpolatedPropertyDefs";
import { Pixels } from "./Pixels";
import { RGBA } from "./RGBA";
import { Definitions } from "./Theme";

export * from "./Env";

const exprEvaluator = new ExprEvaluator();

const exprInstantiator = new ExprInstantiator();

/**
 * A visitor for {@link Expr} nodes.
 */
export interface ExprVisitor<Result, Context> {
    visitNullLiteralExpr(expr: NullLiteralExpr, context: Context): Result;
    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: Context): Result;
    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: Context): Result;
    visitStringLiteralExpr(expr: StringLiteralExpr, context: Context): Result;
    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: Context): Result;
    visitVarExpr(expr: VarExpr, context: Context): Result;
    visitHasAttributeExpr(expr: HasAttributeExpr, context: Context): Result;
    visitCallExpr(expr: CallExpr, context: Context): Result;
    visitMatchExpr(expr: MatchExpr, context: Context): Result;
    visitCaseExpr(expr: CaseExpr, context: Context): Result;
    visitStepExpr(expr: StepExpr, context: Context): Result;
    visitInterpolateExpr(expr: InterpolateExpr, context: Context): Result;
}

/**
 * The dependencies of an {@link Expr}.
 */
export class ExprDependencies {
    /**
     * The properties needed to evaluate the {@link Expr}.
     */
    readonly properties = new Set<string>();

    /**
     * `true` if the expression depends on the feature state.
     */
    featureState?: boolean;

    /**
     * `true` if this expression cannot be cached.
     */
    volatile?: boolean;
}

class ComputeExprDependencies implements ExprVisitor<void, ExprDependencies> {
    static instance = new ComputeExprDependencies();

    /**
     * Gets the dependencies of an {@link Expr}.
     *
     * @param expr - The {@link Expr} to process.
     * @param scope - The evaluation scope. Defaults to [[ExprScope.Value]].
     * @param dependencies - The output [[Set]] of dependency names.
     */
    static of(expr: Expr) {
        const dependencies = new ExprDependencies();
        expr.accept(this.instance, dependencies);
        return dependencies;
    }

    visitNullLiteralExpr(expr: NullLiteralExpr, context: ExprDependencies): void {
        // nothing to do
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: ExprDependencies): void {
        // nothing to do
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: ExprDependencies): void {
        // nothing to do
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, context: ExprDependencies): void {
        // nothing to do
    }

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: ExprDependencies): void {
        // nothing to do
    }

    visitVarExpr(expr: VarExpr, context: ExprDependencies): void {
        context.properties.add(expr.name);
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: ExprDependencies): void {
        context.properties.add(expr.name);
    }

    visitCallExpr(expr: CallExpr, context: ExprDependencies): void {
        expr.args.forEach(childExpr => childExpr.accept(this, context));

        switch (expr.op) {
            case "dynamic-properties":
                context.volatile = true;
                break;
            case "feature-state":
                context.featureState = true;
                context.properties.add("$state");
                context.properties.add("$id");
                break;
            case "id":
                context.properties.add("$id");
                break;
            case "zoom":
            case "world-ppi-scale":
            case "world-discrete-ppi-scale":
                context.properties.add("$zoom");
                break;
            case "geometry-type":
                context.properties.add("$geometryType");
                break;
            default:
                break;
        }
    }

    visitMatchExpr(expr: MatchExpr, context: ExprDependencies): void {
        expr.value.accept(this, context);
        expr.branches.forEach(([_, branch]) => branch.accept(this, context));
        expr.fallback.accept(this, context);
    }

    visitCaseExpr(expr: CaseExpr, context: ExprDependencies): void {
        expr.branches.forEach(([condition, branch]) => {
            condition.accept(this, context);
            branch.accept(this, context);
        });
        expr.fallback.accept(this, context);
    }

    visitStepExpr(expr: StepExpr, context: ExprDependencies): void {
        expr.input.accept(this, context);
        expr.defaultValue.accept(this, context);
        expr.stops.forEach(([_, value]) => value.accept(this, context));
    }

    visitInterpolateExpr(expr: InterpolateExpr, context: ExprDependencies): void {
        expr.input.accept(this, context);
        expr.stops.forEach(([_, value]) => value.accept(this, context));
    }
}

/**
 * A type represeting JSON values.
 */
export type JsonValue = null | boolean | number | string | JsonObject | JsonArray;

/**
 * A type representing JSON arrays.
 */
export interface JsonArray extends Array<JsonValue> {}

/**
 * A type representing JSON objects.
 */
export interface JsonObject {
    [name: string]: JsonValue;
}

/**
 * The JSON representation of an {@link Expr} object.
 */
export type JsonExpr = JsonArray;

export function isJsonExpr(v: any): v is JsonExpr {
    return Array.isArray(v) && v.length > 0 && typeof v[0] === "string";
}

/**
 * Internal state needed by {@link Expr.fromJSON} to resolve `"ref"` expressions.
 */
interface ReferenceResolverState {
    definitions: Definitions;
    lockedNames: Set<string>;
    cache: Map<string, Expr>;
}

/**
 * The evaluation scope of an {@link Expr}.
 */
export enum ExprScope {
    /**
     * The scope of an {@link Expr} used as value of an attribute.
     */
    Value,

    /**
     * The scope of an {@link Expr} used in a [[Technique]] `when` condition.
     */
    Condition,

    /**
     * The scope of an {@link Expr} used as dynamic property attribute value.
     */
    Dynamic
}

/**
 * Abstract class representing the
 * {@link https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/StyleExpressions.md | style expressions}
 * used in {@link Theme}.
 */
export abstract class Expr {
    /**
     * Tests of given value is an {@link Expr}.
     *
     * @param value - The object to test.
     */
    static isExpr(value: any): value is Expr {
        return value instanceof Expr;
    }

    /**
     * Creates an expression from the given `code`.
     *
     * @param code - The code to parse.
     * @returns The parsed {@link Expr}.
     * @deprecated `string` encoded expression are deprecated. Use {@link Expr.fromJSON} instead.
     */
    static parse(code: string): Expr | never {
        const parser = new ExprParser(code);
        const expr = parser.parse();
        return expr;
    }

    /**
     * Creates a style expression from JSON.
     *
     * @remarks
     * The optional set of {@link Theme.definitions | definitions} is used
     * to resolve the {@link https://github.com/heremaps/harp.gl/blob/master/%40here/harp-datasource-protocol/StyleExpressions.md#ref | ref expressions}.
     *
     * @param json - JSON object representing the expression to parse.
     * @param definitions - Optional set of definitions used to expand references.
     * @param definitionExprCache - Optional cache of `Expr` instances
     *
     * @example
     * ```typescript
     * const expr = Expr.fromJSON(["all",
     *     ["==", ["geometry-type"], "LineString"],
     *     ["has", "text"]
     * ]);
     * ```
     */
    static fromJSON(
        json: JsonValue,
        definitions?: Definitions,
        definitionExprCache?: Map<string, Expr>
    ) {
        const referenceResolverState: ReferenceResolverState | undefined =
            definitions !== undefined
                ? {
                      definitions,
                      lockedNames: new Set(),
                      cache: definitionExprCache ?? new Map<string, Expr>()
                  }
                : undefined;

        return parseNode(json, referenceResolverState);
    }

    private m_dependencies?: ExprDependencies;
    private m_isDynamic?: boolean;

    /**
     * Evaluate an expression returning a {@link Value} object.
     *
     * @param env - The {@link Env} used to lookup symbols.
     * @param scope - The evaluation scope. Defaults to [[ExprScope.Value]].
     * @param cache - A cache of previously computed results.
     */
    evaluate(
        env: Env,
        scope: ExprScope = ExprScope.Value,
        cache?: Map<Expr, Value>
    ): Value | never {
        return this.accept(
            exprEvaluator,
            new ExprEvaluatorContext(exprEvaluator, env, scope, cache)
        );
    }

    /**
     * Instantiates this {@link Expr}.
     *
     * @remarks
     * references to the `get` and `has` operator using the given instantiation context.
     *
     * @param context - The [[InstantationContext]] used to resolve names.
     */
    instantiate(context: InstantiationContext): Expr {
        return this.accept(exprInstantiator, context);
    }

    /**
     * Gets the dependencies of this {@link Expr}.
     */
    dependencies(): ExprDependencies {
        if (!this.m_dependencies) {
            this.m_dependencies = ComputeExprDependencies.of(this);
        }
        return this.m_dependencies;
    }

    /**
     * Create a unique object that is structurally equivalent to this {@link Expr}.
     *
     * @param pool - The [[ExprPool]] used to create a unique
     * equivalent object of this {@link Expr}.
     */
    intern(pool: ExprPool): Expr {
        return pool.add(this);
    }

    toJSON(): JsonValue {
        return new ExprSerializer().serialize(this);
    }

    /**
     * Returns `true` if a dynamic execution context is required to evaluate this {@link Expr}.
     */
    isDynamic(): boolean {
        if (this.m_isDynamic === undefined) {
            this.m_isDynamic = this.exprIsDynamic();
        }
        return this.m_isDynamic;
    }

    /**
     * Visits this expression.
     *
     * @param visitor The visitor used to visit the expression.
     * @param context The context passed to the vistor.
     */
    abstract accept<Result, Context>(
        visitor: ExprVisitor<Result, Context>,
        context: Context
    ): Result;

    /**
     * Update the dynamic state of this {@link Expr}.
     *
     * `exprIsDynamic` must never be called directly.
     * @internal
     */
    protected abstract exprIsDynamic(): boolean;
}

/**
 * @internal
 */
export type RelationalOp = "<" | ">" | "<=" | ">=";

/**
 * @internal
 */
export type EqualityOp = "~=" | "^=" | "$=" | "==" | "!=";

/**
 * @internal
 */
export type BinaryOp = RelationalOp | EqualityOp;

/**
 * A node representing a `get` expression.
 */
export class VarExpr extends Expr {
    constructor(readonly name: string) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitVarExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic() {
        return false;
    }
}

/**
 * A node representing a `literal` expression.
 */
export abstract class LiteralExpr extends Expr {
    /**
     * Create a [[LiteralExpr]] from the given value.
     *
     * @param value - A constant value.
     */
    static fromValue(value: Value): Expr {
        switch (typeof value) {
            case "boolean":
                return new BooleanLiteralExpr(value);
            case "number":
                return new NumberLiteralExpr(value);
            case "string":
                return new StringLiteralExpr(value);
            case "object":
                return value === null ? NullLiteralExpr.instance : new ObjectLiteralExpr(value);
            default:
                throw new Error(`failed to create a literal from '${value}'`);
        } // switch
    }

    abstract get value(): Value;

    /** @override */
    protected exprIsDynamic() {
        return false;
    }
}

/**
 * Null literal expression.
 */
export class NullLiteralExpr extends LiteralExpr {
    static instance = new NullLiteralExpr();
    /** @override */
    readonly value: Value = null;

    protected constructor() {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitNullLiteralExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic() {
        return false;
    }
}

/**
 * Boolean literal expression.
 */
export class BooleanLiteralExpr extends LiteralExpr {
    constructor(readonly value: boolean) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitBooleanLiteralExpr(this, context);
    }
}

/**
 * Number literal expression.
 */
export class NumberLiteralExpr extends LiteralExpr {
    constructor(readonly value: number) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitNumberLiteralExpr(this, context);
    }
}

/**
 * String literal expression.
 */
export class StringLiteralExpr extends LiteralExpr {
    private m_promotedValue?: RGBA | Pixels | null;

    constructor(readonly value: string) {
        super();
    }

    /**
     * Returns the value of parsing this string as [[RGBA]] or [[Pixels]] constant.
     */
    get promotedValue(): RGBA | Pixels | undefined {
        if (this.m_promotedValue === undefined) {
            this.m_promotedValue = RGBA.parse(this.value) ?? Pixels.parse(this.value) ?? null;
        }
        return this.m_promotedValue ?? undefined;
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitStringLiteralExpr(this, context);
    }
}

/**
 * Object literal expression.
 */
export class ObjectLiteralExpr extends LiteralExpr {
    constructor(readonly value: object) {
        super();
    }

    get isArrayLiteral() {
        return Array.isArray(this.value);
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitObjectLiteralExpr(this, context);
    }
}

/**
 * A node reperesenting a `has` expression.
 */
export class HasAttributeExpr extends Expr {
    constructor(readonly name: string) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitHasAttributeExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic() {
        return false;
    }
}

/**
 * A node representing a `call` expression.
 */
export class CallExpr extends Expr {
    descriptor?: OperatorDescriptor;

    constructor(readonly op: string, readonly args: Expr[]) {
        super();
    }

    /**
     * Returns the child nodes of this {@link Expr}.
     *
     * @deprecated Use {@link CallExpr.args} instead.
     */
    get children() {
        return this.args;
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitCallExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic() {
        const descriptor = this.descriptor ?? ExprEvaluator.getOperator(this.op);

        if (descriptor && descriptor.isDynamicOperator && descriptor.isDynamicOperator(this)) {
            return true;
        }

        return this.args.some(e => e.isDynamic());
    }
}

/**
 * The labels of a {@link MatchExpr} expression.
 */
export type MatchLabel = number | string | number[] | string[];

/**
 * A node representing a `match` expression.
 */
export class MatchExpr extends Expr {
    /**
     * Tests if the given JSON node is a valid label for the `"match"` operator.
     *
     * @param node - A JSON value.
     */
    static isValidMatchLabel(node: JsonValue): node is MatchLabel {
        switch (typeof node) {
            case "number":
            case "string":
                return true;
            case "object":
                if (!Array.isArray(node) || node.length === 0) {
                    return false;
                }
                const elementTy = typeof node[0];
                if (elementTy === "number" || elementTy === "string") {
                    return node.every(t => typeof t === elementTy);
                }
                return false;
            default:
                return false;
        } // switch
    }

    constructor(
        readonly value: Expr,
        readonly branches: Array<[MatchLabel, Expr]>,
        readonly fallback: Expr
    ) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitMatchExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic() {
        return (
            this.value.isDynamic() ||
            this.branches.some(([_, branch]) => branch.isDynamic()) ||
            this.fallback.isDynamic()
        );
    }
}

/**
 * A node representing a `case` expression.
 */
export class CaseExpr extends Expr {
    constructor(readonly branches: Array<[Expr, Expr]>, readonly fallback: Expr) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitCaseExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic() {
        return (
            this.branches.some(([cond, branch]) => cond.isDynamic() || branch.isDynamic()) ||
            this.fallback.isDynamic()
        );
    }
}

/**
 * A node representing a `step` expression.
 */
export class StepExpr extends Expr {
    constructor(
        readonly input: Expr,
        readonly defaultValue: Expr,
        readonly stops: Array<[number, Expr]>
    ) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitStepExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic(): boolean {
        return (
            this.input.isDynamic() ||
            this.defaultValue.isDynamic() ||
            this.stops.some(([_, value]) => value.isDynamic())
        );
    }
}

/**
 * The type of the interpolation mode.
 */
export type InterpolateMode = ["discrete"] | ["linear"] | ["cubic"] | ["exponential", number];

/**
 * A node representing an `interpolate` expression.
 */
export class InterpolateExpr extends Expr {
    constructor(
        readonly mode: InterpolateMode,
        readonly input: Expr,
        readonly stops: Array<[number, Expr]>
    ) {
        super();
    }

    /** @override */
    accept<Result, Context>(visitor: ExprVisitor<Result, Context>, context: Context): Result {
        return visitor.visitInterpolateExpr(this, context);
    }

    /** @override */
    protected exprIsDynamic(): boolean {
        return this.input.isDynamic() || this.stops.some(([_, value]) => value.isDynamic());
    }
}

/**
 * Serializes the Expr to JSON.
 *
 * @internal
 */
class ExprSerializer implements ExprVisitor<JsonValue, void> {
    serialize(expr: Expr): JsonValue {
        return expr.accept(this, undefined);
    }

    visitNullLiteralExpr(expr: NullLiteralExpr, context: void): JsonValue {
        return null;
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: void): JsonValue {
        return expr.value;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: void): JsonValue {
        return expr.value;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, context: void): JsonValue {
        return expr.value;
    }

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: void): JsonValue {
        if (expr.value instanceof THREE.Vector2) {
            return ["make-vector", expr.value.x, expr.value.y];
        } else if (expr.value instanceof THREE.Vector3) {
            return ["make-vector", expr.value.x, expr.value.y, expr.value.z];
        } else if (expr.value instanceof THREE.Vector4) {
            return ["make-vector", expr.value.x, expr.value.y, expr.value.z, expr.value.w];
        }
        return ["literal", expr.value as JsonObject];
    }

    visitVarExpr(expr: VarExpr, context: void): JsonValue {
        return ["get", expr.name];
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: void): JsonValue {
        return ["has", expr.name];
    }

    visitCallExpr(expr: CallExpr, context: void): JsonValue {
        return [expr.op, ...expr.args.map(childExpr => this.serialize(childExpr))];
    }

    visitMatchExpr(expr: MatchExpr, context: void): JsonValue {
        const branches: JsonValue[] = [];
        for (const [label, body] of expr.branches) {
            branches.push(label, this.serialize(body));
        }
        return ["match", this.serialize(expr.value), ...branches, this.serialize(expr.fallback)];
    }

    visitCaseExpr(expr: CaseExpr, context: void): JsonValue {
        const branches: JsonValue[] = [];
        for (const [condition, body] of expr.branches) {
            branches.push(this.serialize(condition), this.serialize(body));
        }
        return ["case", ...branches, this.serialize(expr.fallback)];
    }

    visitStepExpr(expr: StepExpr, context: void): JsonValue {
        const result: JsonArray = ["step"];
        result.push(this.serialize(expr.input));
        result.push(this.serialize(expr.defaultValue));
        expr.stops.forEach(([key, value]) => {
            result.push(key);
            result.push(this.serialize(value));
        });
        return result;
    }

    visitInterpolateExpr(expr: InterpolateExpr, context: void): JsonValue {
        const result: JsonArray = ["interpolate", expr.mode];
        result.push(this.serialize(expr.input));
        expr.stops.forEach(([key, value]) => {
            result.push(key);
            result.push(this.serialize(value));
        });
        return result;
    }
}

function parseNode(
    node: JsonValue,
    referenceResolverState: ReferenceResolverState | undefined
): Expr {
    if (Array.isArray(node)) {
        return parseCall(node, referenceResolverState);
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

function parseCall(node: JsonArray, referenceResolverState?: ReferenceResolverState): Expr {
    const op = node[0];

    if (typeof op !== "string") {
        throw new Error("expected a builtin function name");
    }

    switch (op) {
        case "!has":
        case "!in":
            return new CallExpr("!", [parseCall([op.slice(1), ...node.slice(1)])]);

        case "ref":
            return resolveReference(node, referenceResolverState);

        case "get":
            return parseGetExpr(node, referenceResolverState);

        case "has":
            return parseHasExpr(node, referenceResolverState);

        case "literal":
            return parseLiteralExpr(node);

        case "match":
            return parseMatchExpr(node, referenceResolverState);

        case "case":
            return parseCaseExpr(node, referenceResolverState);

        case "interpolate":
            return parseInterpolateExpr(node, referenceResolverState);

        case "step":
            return parseStepExpr(node, referenceResolverState);

        default:
            return makeCallExpr(op, node, referenceResolverState);
    } // switch
}

function parseGetExpr(node: JsonArray, referenceResolverState: ReferenceResolverState | undefined) {
    if (node[2] !== undefined) {
        return makeCallExpr("get", node, referenceResolverState);
    }
    const name = node[1];
    if (typeof name !== "string") {
        throw new Error(`expected the name of an attribute`);
    }
    return new VarExpr(name);
}

function parseHasExpr(node: JsonArray, referenceResolverState: ReferenceResolverState | undefined) {
    if (node[2] !== undefined) {
        return makeCallExpr("has", node, referenceResolverState);
    }
    const name = node[1];
    if (typeof name !== "string") {
        throw new Error(`expected the name of an attribute`);
    }
    return new HasAttributeExpr(name);
}

function parseLiteralExpr(node: JsonArray) {
    const obj = node[1];
    if (obj === null || typeof obj !== "object") {
        throw new Error("expected an object or array literal");
    }
    return new ObjectLiteralExpr(obj);
}

function parseMatchExpr(
    node: JsonArray,
    referenceResolverState: ReferenceResolverState | undefined
) {
    if (node.length < 4) {
        throw new Error("not enough arguments");
    }
    if (!(node.length % 2)) {
        throw new Error("fallback is missing in 'match' expression");
    }
    const value = parseNode(node[1], referenceResolverState);
    const conditions: Array<[MatchLabel, Expr]> = [];
    for (let i = 2; i < node.length - 1; i += 2) {
        const label = node[i];
        if (!MatchExpr.isValidMatchLabel(label)) {
            throw new Error(`'${JSON.stringify(label)}' is not a valid label for 'match'`);
        }
        const expr = parseNode(node[i + 1], referenceResolverState);
        conditions.push([label, expr]);
    }
    const fallback = parseNode(node[node.length - 1], referenceResolverState);
    return new MatchExpr(value, conditions, fallback);
}

function parseCaseExpr(
    node: JsonArray,
    referenceResolverState: ReferenceResolverState | undefined
) {
    if (node.length < 3) {
        throw new Error("not enough arguments");
    }
    if (node.length % 2) {
        throw new Error("fallback is missing in 'case' expression");
    }
    const branches: Array<[Expr, Expr]> = [];
    for (let i = 1; i < node.length - 1; i += 2) {
        const condition = parseNode(node[i], referenceResolverState);
        const expr = parseNode(node[i + 1], referenceResolverState);
        branches.push([condition, expr]);
    }
    const caseFallback = parseNode(node[node.length - 1], referenceResolverState);
    return new CaseExpr(branches, caseFallback);
}

function isInterpolationMode(object: any): object is InterpolateMode {
    if (!Array.isArray(object)) {
        return false;
    }
    switch (object[0]) {
        case "discrete":
        case "linear":
        case "cubic":
        case "exponential":
            return true;
        default:
            return false;
    }
}

function parseInterpolateExpr(
    node: JsonArray,
    referenceResolverState: ReferenceResolverState | undefined
) {
    const mode: InterpolateMode = node[1] as any;
    if (!isInterpolationMode(mode)) {
        throw new Error("expected an interpolation type");
    }
    if (mode[0] === "exponential" && typeof mode[1] !== "number") {
        throw new Error("expected the base of the exponential interpolation");
    }
    const input = node[2] !== undefined ? parseNode(node[2], referenceResolverState) : undefined;
    if (!Expr.isExpr(input)) {
        throw new Error(`expected the input of the interpolation`);
    }
    if (node.length === 3 || !(node.length % 2)) {
        throw new Error("invalid number of samples");
    }

    const stops: Array<[number, Expr]> = [];
    for (let i = 3; i < node.length - 1; i += 2) {
        const key = node[i] as number;
        const value = parseNode(node[i + 1], referenceResolverState);
        stops.push([key, value]);
    }
    return new InterpolateExpr(mode, input, stops);
}

function parseStepExpr(
    node: JsonArray,
    referenceResolverState: ReferenceResolverState | undefined
) {
    if (node.length < 2) {
        throw new Error("expected the input of the 'step' operator");
    }
    if (node.length < 3 || !(node.length % 2)) {
        throw new Error("not enough arguments");
    }
    const input = parseNode(node[1], referenceResolverState);
    const defaultValue = parseNode(node[2], referenceResolverState);
    const stops: Array<[number, Expr]> = [];
    for (let i = 3; i < node.length; i += 2) {
        const key = node[i] as number;
        const value = parseNode(node[i + 1], referenceResolverState);
        stops.push([key, value]);
    }
    return new StepExpr(input, defaultValue, stops);
}

function makeCallExpr(
    op: string,
    node: any[],
    referenceResolverState?: ReferenceResolverState
): Expr {
    return new CallExpr(
        op,
        node.slice(1).map(childExpr => parseNode(childExpr, referenceResolverState))
    );
}

function resolveReference(node: JsonArray, referenceResolverState?: ReferenceResolverState) {
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
    let result: Expr;
    if (isInterpolatedPropertyDefinition(definitionEntry.value)) {
        // found a reference to an interpolation using
        // the deprecated object-like syntax.
        return Expr.fromJSON(interpolatedPropertyDefinitionToJsonExpr(definitionEntry.value));
    } else if (isJsonExpr(definitionEntry.value)) {
        definitionEntry = definitionEntry.value;
    } else {
        return Expr.fromJSON(definitionEntry.value);
    }

    if (isJsonExpr(definitionEntry)) {
        referenceResolverState.lockedNames.add(name);
        try {
            result = parseNode(definitionEntry, referenceResolverState);
        } finally {
            referenceResolverState.lockedNames.delete(name);
        }
    } else {
        throw new Error(`unsupported definition ${name}`);
    }
    referenceResolverState.cache.set(name, result);
    return result;
}
