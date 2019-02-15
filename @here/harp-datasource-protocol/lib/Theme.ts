/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LoggerManager } from "@here/harp-utils";
import { InterpolationMode, Technique } from "./Techniques";

import * as THREE from "three";

const logger = LoggerManager.instance.create("Theme");

/**
 * @hidden
 */
export type UnaryOp = "has" | "!";

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
export type Literal = "boolean" | "number" | "string";

/**
 * @hidden
 */
export type ExprKind = "var" | "in" | Literal | UnaryOp | RelationalOp | EqualityOp | LogicalOp;

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
 * Attach a named property to an existing [[Env]] object.
 */
export class Bind extends Env {
    constructor(
        private readonly name: string,
        private readonly value: Value,
        private readonly parent?: Env
    ) {
        super();
    }

    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(name: string): Value {
        if (name === this.name) {
            return this.value;
        }

        return this.parent ? this.parent.lookup(name) : undefined;
    }

    /**
     * Return an object containing all properties of this environment, takes care of the parent
     * object.
     */
    unmap(): any {
        const obj: any = this.parent ? this.parent.unmap() : {};

        obj[this.name] = this.value;

        return obj;
    }
}

/**
 * @hidden
 */
export interface ValueMap {
    [name: string]: Value;
}

/**
 * @hidden
 */
export const EmptyEnv: Env = {
    /**
     * Returns property in [[Env]] by name.
     */
    lookup(_name: string) {
        return undefined;
    },

    /**
     * Return an object containing all properties of this environment. (Here: empty object).
     */
    unmap(): any {
        return {};
    }
};

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
        const value = this.entries[name];

        if (value !== undefined) {
            return value;
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
 * Abstract class defining a shape of a [[Theme]]'s expression
 */
export abstract class Expr {
    /**
     * Returns a parsed expression.
     * @param code String which describes the type of expression to be parsed, for example "var".
     */
    static parse(code: string): Expr {
        const parser = new Parser(code);
        const expr = parser.parse();
        return expr;
    }

    constructor(readonly kind: ExprKind) {}

    /**
     * Evaluate an expression returning a [[Value]] object.
     */
    abstract evaluate(env: Env): Value | never;
}

/**
 * Var expression.
 */
class VarExpr extends Expr {
    constructor(readonly name: string) {
        super("var");
    }

    evaluate(env: Env): Value | never {
        const value = env.lookup(this.name);
        return value;
    }
}

/**
 * Number literal expression.
 */
class NumberLiteralExpr extends Expr {
    constructor(readonly value: number) {
        super("number");
    }

    evaluate(): Value | never {
        return this.value;
    }
}

/**
 * String literal expression.
 */
class StringLiteralExpr extends Expr {
    constructor(readonly value: string) {
        super("string");
    }

    evaluate(): Value | never {
        return this.value;
    }
}

/**
 * A has expression with an attribute, for example `has(ref)`.
 */
class HasAttributeExpr extends Expr {
    constructor(readonly attribute: string) {
        super("has");
    }

    evaluate(env: Env): Value | never {
        return env.lookup(this.attribute) !== undefined;
    }
}

/**
 * A contains expression.
 */
class ContainsExpr extends Expr {
    constructor(readonly value: Expr, readonly elements: Expr[]) {
        super("in");
    }

    evaluate(env: Env): Value | never {
        const value = this.value.evaluate(env);
        for (const e of this.elements) {
            const element = e.evaluate(env);
            if (value === element) {
                return true;
            }
        }
        return false;
    }
}

/**
 * A `not` expression.
 */
class NotExpr extends Expr {
    constructor(readonly expr: Expr) {
        super("!");
    }

    evaluate(env: Env): Value | never {
        return !this.expr.evaluate(env);
    }
}

/**
 * A binary operator expression
 */
class BinaryExpr extends Expr {
    constructor(readonly op: BinaryOp, readonly left: Expr, readonly right: Expr) {
        super(op);
    }

    evaluate(env: Env): Value | never {
        const left = this.left.evaluate(env);
        const right = this.right.evaluate(env);
        switch (this.op) {
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
        throw new Error(`invalid relational op ${this.op}`);
    }
}

/**
 * Logical expression.
 */
class LogicalExpr extends Expr {
    constructor(readonly op: LogicalOp, readonly left: Expr, readonly right: Expr) {
        super(op);
    }

    evaluate(env: Env): Value | never {
        const value = this.left.evaluate(env);
        switch (this.op) {
            case "||":
                return value || this.right.evaluate(env);
            case "&&":
                return value && this.right.evaluate(env);
        } // switch
        throw new Error(`invalid logical op ${this.op}`);
    }
}

/**
 * Character value
 */
enum Character {
    Tab = 9,
    Lf = 10,
    Cr = 13,
    Space = 32,
    LParen = 40,
    RParen = 41,
    Comma = 44,
    Dot = 46,
    LBracket = 91,
    Backslash = 92,
    RBracket = 93,
    _0 = 48,
    _9 = 57,
    _ = 95,
    A = 64,
    Z = 90,
    a = 97,
    z = 122,
    DoubleQuote = 34,
    SingleQuote = 39,
    Exclaim = 33,
    Equal = 61,
    Caret = 94,
    Tilde = 126,
    Dollar = 36,
    Less = 60,
    Greater = 62,
    Bar = 124,
    Amp = 38
}

/**
 * Check if a codepoint is a whitespace character.
 */
function isSpace(codepoint: number): boolean {
    switch (codepoint) {
        case Character.Tab:
        case Character.Lf:
        case Character.Cr:
        case Character.Space:
            return true;
        default:
            return false;
    } // switch
}

/**
 * Check if codepoint is a digit character.
 */
function isNumber(codepoint: number): boolean {
    return codepoint >= Character._0 && codepoint <= Character._9;
}

/**
 * Check if codepoint is a letter character.
 */
function isLetter(codepoint: number): boolean {
    return (
        (codepoint >= Character.a && codepoint <= Character.z) ||
        (codepoint >= Character.A && codepoint <= Character.Z)
    );
}

/**
 * Check if codepoint is either a digit or a letter character.
 */
function isLetterOrNumber(codepoint: number): boolean {
    return isLetter(codepoint) || isNumber(codepoint);
}

/**
 * Check if codepoint is an identification character: underscore, dollar sign, dot or bracket.
 */
function isIdentChar(codepoint: number): boolean {
    return (
        isLetterOrNumber(codepoint) ||
        codepoint === Character._ ||
        codepoint === Character.Dollar ||
        codepoint === Character.Dot ||
        codepoint === Character.LBracket ||
        codepoint === Character.RBracket
    );
}

/**
 * Tokens used in theme grammar.
 */
enum Token {
    Eof = 0,
    Error,
    Identifier,
    Number,
    String,
    Comma,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Exclaim,
    TildeEqual,
    CaretEqual,
    DollarEqual,
    EqualEqual,
    ExclaimEqual,
    Less,
    Greater,
    LessEqual,
    GreaterEqual,
    BarBar,
    AmpAmp
}

/**
 * Maps a token to its string name.
 */
function tokenSpell(token: Token): string {
    switch (token) {
        case Token.Eof:
            return "eof";
        case Token.Error:
            return "error";
        case Token.Identifier:
            return "identifier";
        case Token.Number:
            return "number";
        case Token.String:
            return "string";
        case Token.Comma:
            return ",";
        case Token.LParen:
            return "(";
        case Token.RParen:
            return ")";
        case Token.LBracket:
            return "[";
        case Token.RBracket:
            return "]";
        case Token.Exclaim:
            return "!";
        case Token.TildeEqual:
            return "~=";
        case Token.CaretEqual:
            return "^=";
        case Token.DollarEqual:
            return "$=";
        case Token.EqualEqual:
            return "==";
        case Token.ExclaimEqual:
            return "!=";
        case Token.Less:
            return "<";
        case Token.Greater:
            return ">";
        case Token.LessEqual:
            return "<=";
        case Token.GreaterEqual:
            return ">=";
        case Token.BarBar:
            return "||";
        case Token.AmpAmp:
            return "&&";
        default:
            throw new Error(`invalid token ${token}`);
    }
}

/**
 * Lexer class implementation.
 */
class Lexer {
    private m_token: Token = Token.Error;
    private m_index = 0;
    private m_char: number = Character.Lf;
    private m_text?: string;

    constructor(readonly code: string) {}

    /**
     * Single lexer token.
     */
    token(): Token {
        return this.m_token;
    }

    /**
     * Parsed text.
     */
    text(): string {
        return this.m_text || "";
    }

    /**
     * Go to the next token.
     */
    next(): Token {
        this.m_token = this.yylex();
        if (this.m_token === Token.Error) {
            throw new Error(`unexpected character ${this.m_char}`);
        }
        return this.m_token;
    }

    private yyinp(): void {
        this.m_char = this.code.codePointAt(this.m_index++) || 0;
    }

    private yylex(): Token {
        this.m_text = undefined;

        while (isSpace(this.m_char)) {
            this.yyinp();
        }

        if (this.m_char === 0) {
            return Token.Eof;
        }

        const ch = this.m_char;
        this.yyinp();

        switch (ch) {
            case Character.LParen:
                return Token.LParen;
            case Character.RParen:
                return Token.RParen;
            case Character.LBracket:
                return Token.LBracket;
            case Character.RBracket:
                return Token.RBracket;
            case Character.Comma:
                return Token.Comma;

            case Character.SingleQuote:
            case Character.DoubleQuote: {
                const start = this.m_index - 1;
                while (this.m_char && this.m_char !== ch) {
                    // ### TODO handle escape sequences
                    this.yyinp();
                }
                if (this.m_char !== ch) {
                    throw new Error("Unfinished string literal");
                }
                this.yyinp();
                this.m_text = this.code.substring(start, this.m_index - 2);
                return Token.String;
            }

            case Character.Exclaim:
                if (this.m_char === Character.Equal) {
                    this.yyinp();
                    return Token.ExclaimEqual;
                }
                return Token.Exclaim;

            case Character.Caret:
                if (this.m_char === Character.Equal) {
                    this.yyinp();
                    return Token.CaretEqual;
                }
                return Token.Error;

            case Character.Tilde:
                if (this.m_char === Character.Equal) {
                    this.yyinp();
                    return Token.TildeEqual;
                }
                return Token.Error;

            case Character.Equal:
                if (this.m_char === Character.Equal) {
                    this.yyinp();
                    return Token.EqualEqual;
                }
                return Token.Error;

            case Character.Less:
                if (this.m_char === Character.Equal) {
                    this.yyinp();
                    return Token.LessEqual;
                }
                return Token.Less;

            case Character.Greater:
                if (this.m_char === Character.Equal) {
                    this.yyinp();
                    return Token.GreaterEqual;
                }
                return Token.Greater;

            case Character.Bar:
                if (this.m_char === Character.Bar) {
                    this.yyinp();
                    return Token.BarBar;
                }
                return Token.Error;

            case Character.Amp:
                if (this.m_char === Character.Amp) {
                    this.yyinp();
                    return Token.AmpAmp;
                }
                return Token.Error;

            default: {
                const start = this.m_index - 2;
                if (
                    isLetter(ch) ||
                    ch === Character._ ||
                    (ch === Character.Dollar && isIdentChar(this.m_char))
                ) {
                    while (isIdentChar(this.m_char)) {
                        this.yyinp();
                    }
                    this.m_text = this.code.substring(start, this.m_index - 1);
                    return Token.Identifier;
                } else if (isNumber(ch)) {
                    while (isNumber(this.m_char)) {
                        this.yyinp();
                    }
                    if (this.m_char === Character.Dot) {
                        this.yyinp();
                        while (isNumber(this.m_char)) {
                            this.yyinp();
                        }
                    }
                    this.m_text = this.code.substring(start, this.m_index - 1);
                    return Token.Number;
                } else if (ch === Character.Dollar) {
                    if (this.m_char === Character.Equal) {
                        this.yyinp();
                        return Token.DollarEqual;
                    }
                    return Token.Error;
                }
            }
        }

        return Token.Error;
    }
}

function getEqualityOp(token: Token): EqualityOp | undefined {
    switch (token) {
        case Token.TildeEqual:
            return "~=";
        case Token.CaretEqual:
            return "^=";
        case Token.DollarEqual:
            return "$=";
        case Token.EqualEqual:
            return "==";
        case Token.ExclaimEqual:
            return "!=";
        default:
            return undefined;
    } // switch
}

function getRelationalOp(token: Token): RelationalOp | undefined {
    switch (token) {
        case Token.Less:
            return "<";
        case Token.Greater:
            return ">";
        case Token.LessEqual:
            return "<=";
        case Token.GreaterEqual:
            return ">=";
        default:
            return undefined;
    } // switch
}

class Parser {
    private readonly lex: Lexer;

    constructor(code: string) {
        this.lex = new Lexer(code);
        this.lex.next();
    }

    parse(): Expr | never {
        return this.parseLogicalOr();
    }

    private yyexpect(token: Token): void | never {
        if (this.lex.token() !== token) {
            throw new Error(
                `Syntax error: Expected token '${tokenSpell(token)}' but ` +
                    `found '${tokenSpell(this.lex.token())}'`
            );
        }
        this.lex.next();
    }

    private parsePrimary(): Expr | never {
        switch (this.lex.token()) {
            case Token.Identifier: {
                const text = this.lex.text();
                if (text !== "has") {
                    const expr = new VarExpr(text);
                    this.lex.next();
                    return expr;
                }
                this.lex.next(); // skip has
                this.yyexpect(Token.LParen);
                const attribute = this.lex.text();
                this.yyexpect(Token.Identifier);
                this.yyexpect(Token.RParen);
                return new HasAttributeExpr(attribute);
            }

            case Token.Number: {
                const expr = new NumberLiteralExpr(parseFloat(this.lex.text()));
                this.lex.next();
                return expr;
            }

            case Token.String: {
                const expr = new StringLiteralExpr(this.lex.text());
                this.lex.next();
                return expr;
            }

            case Token.LParen: {
                this.lex.next();
                const expr = this.parseLogicalOr();
                this.yyexpect(Token.RParen);
                return expr;
            }
        }

        throw new Error("Syntax error");
    }

    private parseUnary(): Expr | never {
        if (this.lex.token() === Token.Exclaim) {
            this.lex.next();
            return new NotExpr(this.parseUnary());
        }
        return this.parsePrimary();
    }

    private parseRelational(): Expr | never {
        let expr = this.parseUnary();
        while (true) {
            if (this.lex.token() === Token.Identifier && this.lex.text() === "in") {
                this.lex.next();
                this.yyexpect(Token.LBracket);
                const elements = [this.parsePrimary()];
                while (this.lex.token() === Token.Comma) {
                    this.lex.next();
                    elements.push(this.parsePrimary());
                }
                this.yyexpect(Token.RBracket);
                expr = new ContainsExpr(expr, elements);
            } else {
                const op = getRelationalOp(this.lex.token());
                if (op === undefined) {
                    break;
                }
                this.lex.next();
                const right = this.parseUnary();
                expr = new BinaryExpr(op, expr, right);
            }
        }
        return expr;
    }

    private parseEquality(): Expr | never {
        let expr = this.parseRelational();
        while (true) {
            const op = getEqualityOp(this.lex.token());
            if (op === undefined) {
                break;
            }
            this.lex.next();
            const right = this.parseRelational();
            expr = new BinaryExpr(op, expr, right);
        }
        return expr;
    }

    private parseLogicalAnd(): Expr | never {
        let expr = this.parseEquality();
        while (this.lex.token() === Token.AmpAmp) {
            this.lex.next();
            const right = this.parseEquality();
            expr = new LogicalExpr("&&", expr, right);
        }
        return expr;
    }

    private parseLogicalOr(): Expr | never {
        let expr = this.parseLogicalAnd();
        while (this.lex.token() === Token.BarBar) {
            this.lex.next();
            const right = this.parseLogicalAnd();
            expr = new LogicalExpr("||", expr, right);
        }
        return expr;
    }
}

interface InterpolatedPropertyDefinition<T> {
    interpolation?: "Discrete" | "Linear" | "Cubic";
    zoomLevels: number[];
    values: T[];
}

function isInterpolatedPropertyDefinition<T>(p: any): p is InterpolatedPropertyDefinition<T> {
    if (
        p.values instanceof Array &&
        p.values.length > 0 &&
        p.values[0] !== undefined &&
        p.zoomLevels instanceof Array &&
        p.zoomLevels.length > 0 &&
        p.zoomLevels[0] !== undefined &&
        p.values.length === p.zoomLevels.length
    ) {
        return true;
    }
    return false;
}

function removeDuplicatePropertyValues<T>(p: InterpolatedPropertyDefinition<T>) {
    for (let i = 0; i < p.values.length; ++i) {
        const firstIdx = p.zoomLevels.findIndex((a: number) => {
            return a === p.zoomLevels[i];
        });
        if (firstIdx !== i) {
            p.zoomLevels.splice(--i, 1);
            p.values.splice(--i, 1);
        }
    }
}

function createInterpolatedProperty<T>(prop: InterpolatedPropertyDefinition<T>) {
    removeDuplicatePropertyValues(prop);
    const propKeys = new Float32Array(prop.zoomLevels);
    let propValues;
    switch (typeof prop.values[0]) {
        default:
        case "number":
            propValues = new Float32Array((prop.values as any[]) as number[]);
            return {
                interpolationMode:
                    prop.interpolation !== undefined
                        ? InterpolationMode[prop.interpolation]
                        : InterpolationMode.Discrete,
                zoomLevels: propKeys,
                values: propValues
            };
        case "boolean":
            propValues = new Float32Array(prop.values.length);
            for (let i = 0; i < prop.values.length; ++i) {
                propValues[i] = ((prop.values[i] as unknown) as boolean) ? 1 : 0;
            }
            return {
                interpolationMode: InterpolationMode.Discrete,
                zoomLevels: propKeys,
                values: propValues
            };
        case "string":
            propValues = new Float32Array(prop.values.length * 3);
            for (let i = 0; i < prop.values.length; ++i) {
                const value = +((prop.values[i] as unknown) as string).replace("#", "0x");
                // tslint:disable:no-bitwise
                const channels = [
                    ((value >> 16) & 255) / 255,
                    ((value >> 8) & 255) / 255,
                    ((value >> 0) & 255) / 255
                ];
                // tslint:disable:bitwise
                for (let j = 0; j < prop.values.length * 3; ++j) {
                    propValues[i * 3 + j] = channels[j];
                }
            }
            return {
                interpolationMode:
                    prop.interpolation !== undefined
                        ? InterpolationMode[prop.interpolation]
                        : InterpolationMode.Discrete,
                zoomLevels: propKeys,
                values: propValues
            };
    }
}

/**
 * An array of [[Style]]s that are used together to define how a [[DataSource]] should be rendered.
 * `StyleSet`s are applied to sources providing vector tiles via their method `setStyleSet`. This
 * is also handle internally when a whole theme is passed to a [[MapView]] via `mapview.theme`.
 */
export type StyleSet = Style[];

/**
 * The object that defines what way an item of a [[DataSource]] should be decoded to assemble a
 * tile. [[Style]] is describing which features are shown on a map and in what way they are being
 * shown.
 */
export interface Style {
    /**
     * Human readable description.
     */
    description?: string;

    /**
     * Compile-time condition.
     */
    when: string;

    /**
     * Optimization: Lazy creation and storage of expression in a style object.
     */
    _whenExpr?: Expr;

    /**
     * Technique name. Must be one of `"line"`, `"fill"`, `"solid-line"`, `"dashed-line"`,
     * `"extruded-line"`, `"extruded-polygon"`, `"text"`, `"landmark"`, or `"none"`.
     */
    technique?: string;

    /**
     * Specify `renderOrder` of object.
     */
    renderOrder?: number;

    /**
     * Property that is used to hold the z-order delta.
     */
    renderOrderBiasProperty?: string;

    /**
     * Minimum and maximum z-order delta values.
     */
    renderOrderBiasRange?: [number, number];

    /**
     * Z-order group. For example: used to set same render order for all roads
     * to be able to use the z-order delta when drawing tunnels or bridges over or under the roads.
     */
    renderOrderBiasGroup?: string;

    /**
     * Optional. If `true`, no more matching styles will be evaluated.
     */
    final?: boolean;

    /**
     * Optional. If `true`, no IDs will be saved for the geometry this style creates. Default is
     * `false`.
     */
    transient?: boolean;

    /**
     * Attributes that define the technique.
     */
    attr?: {
        [name: string]:
            | number
            | InterpolatedPropertyDefinition<number>
            | boolean
            | InterpolatedPropertyDefinition<boolean>
            | string
            | InterpolatedPropertyDefinition<string>;
    };

    /**
     * Array of substyles.
     */
    styles?: StyleSet;

    /**
     * Optimization: Index in the table of [[StyleSetEvaluator]].
     */
    _index?: number;

    /**
     * Optional: If `true`, the objects with matching `when` statement will be printed to the
     * console.
     */
    debug?: boolean;

    // TODO: Make pixel units default.
    /**
     * Units in which different size properties are specified. Either `Meter` (default) or `Pixel`.
     */
    metricUnit?: string;

    /**
     * XYZ defines the property to display as text label of a feature in the styles.
     */
    labelProperty?: string;
}

/**
 * Interface describing a `Vector3` class.
 */
export interface Vector3Like {
    x: number;
    y: number;
    z: number;
}

/**
 * Possible lights used for light the map.
 */
export type Light = AmbientLight | DirectionalLight;

export interface BaseLight {
    type: string;
    name: string;
}

/**
 * Light type: ambient.
 */
export interface AmbientLight extends BaseLight {
    type: "ambient";
    color: string;
    intensity?: number;
}

/**
 * Light type: directional.
 */
export interface DirectionalLight extends BaseLight {
    type: "directional";
    color: string;
    intensity: number;
    direction: Vector3Like;
    castShadow?: boolean;
}

/**
 * Various text styles used with labels and texts.
 */
export interface TextStyle {
    color?: string;
    allCaps?: boolean;
    smallCaps?: boolean;
    bold?: boolean;
    oblique?: boolean;
    backgroundColor?: string;
    backgroundSize?: number;
    backgroundAlpha?: number;
    tracking?: number;
    fontCatalogName?: string;
    name?: string;
}

/**
 * Interface that defines the options to configure the sky
 *
 * @param type Represents the type of sky. At the moment only the sky as a texture is available
 * @param colorTop Defines the color of the upper part of the gradient.
 * @param colorBottom Defines the color of bottom part of the gradient that touches the ground
 * @param groundColor Defines the color of the first pixel of the gradient from the bottom.
 * @param monomialPower Defines the texture gradient power.
 */
export interface Sky {
    type: string;
    colorTop: string;
    colorBottom: string;
    groundColor: string;
    monomialPower?: number;
}

/**
 * Interface that defines the options to configure the sky
 *
 * @param enabled Whether the fog is enabled.
 * @param startRatio Distance ratio to far plane at which the linear fogging begins.
 */
export interface Fog {
    startRatio: number;
}

/**
 * Define an image (e.g. icon).
 */
export interface ImageDefinition {
    /** Url to load content from. */
    url: string;
    /** `true` to start loading at init tile, `false` to lazily wait until required. */
    preload: boolean;
    /** Url of JSON file containing the texture atlas */
    atlas?: string;
}

export interface ImageDefinitions {
    /** Name of Image. */
    [name: string]: ImageDefinition;
}

/**
 * Can be used to create a texture atlas.
 */
export interface ImageTexture {
    /** Name of ImageTexture. Used to reference texture in the styles. */
    name: string;
    /** Name of ImageDefinition to use. */
    image: string;
    /** Origin of image, defaults to "topleft" */
    origin?: string;
    /** Specify sub-region: Defaults to 0. */
    xOffset?: number;
    /** Specify sub-region: Defaults to 0. */
    yOffset?: number;
    /** Specify sub-region:  Defaults to 0, meaning width is taken from loaded image. */
    width?: number;
    /** Specify sub-region:  Defaults to 0, meaning height is taken from loaded image. */
    height?: number;
    /** Defaults to false. */
    flipH?: boolean;
    /** Defaults to false. */
    flipV?: boolean;
    /** Defaults to 1. */
    opacity?: number;
}

/**
 * Definition for a [[PoiTable]] reference as part of the [[Theme]] object.
 */
export interface PoiTableRef {
    /** Required name of the [[PoiTable]] for later reference. */
    name: string;
    /** Required URL from where to load [[PoiTable]]. */
    url: string;
    /**
     * If set to `true`, the list of values in the field "altNames" will be used as names for this
     * POI.
     */
    useAltNamesForKey: boolean;
}

/**
 * Interface for the JSON description of the [[PoiTable]]. It is being implemented in [[PoiTable]].
 */
export interface PoiTableDef {
    /** Name of the `PoiTable`. Must be unique. */
    name?: string;
    /**
     * Stores the list of [[PoiTableEntry]]s.
     */
    poiList?: PoiTableEntryDef[];
}

/**
 * Interface for the JSON description of the [[PoiTableEntry]]. The interface is being implemented
 * as [[PoiTableEntry]].
 */
export interface PoiTableEntryDef {
    /** Default name of the POI as the key for looking it up. */
    name?: string;
    /** Alternative names of the POI. */
    altNames?: string[];
    /** Visibility of the POI. If `false`, the POI will not be rendered. */
    visible?: boolean;
    /** Name of the icon, defined in the the texture atlases. */
    iconName?: string;
    /** Stacking mode of the POI. For future use. */
    stackMode?: string;
    /**
     * Priority of the POI to select the visible set in case there are more POIs than can be
     * handled.
     */
    priority?: number;
    /** Minimum zoom level to render the icon on. */
    iconMinLevel?: number;
    /** Maximum zoom level to render the icon on. */
    iconMaxLevel?: number;
    /** Minimum zoom level to render the text label on. */
    textMinLevel?: number;
    /** Maximum zoom level to render the text label on. */
    textMaxLevel?: number;
}

interface Styles {
    [styleSetName: string]: StyleSet;
}

/**
 * Map theme is used to define what features are shown and how the map is styled, for example
 * which lightning is used or whether fog should be displayed.
 */
export interface Theme {
    /**
     * Actual URL the theme has been loaded from.
     */
    url?: string;
    clearColor?: string;
    defaultTextStyle?: TextStyle;
    lights?: Light[];
    sky?: Sky;
    fog?: Fog;
    styles?: Styles;
    textStyles?: TextStyle[];
    fontCatalogs?: FontCatalogConfig[];
    images?: ImageDefinitions;
    imageTextures?: ImageTexture[];
    /**
     * Optional list of [[ThemePoiTableDef]]s.
     */
    poiTables?: PoiTableRef[];
}

/**
 * Fonts used for all text related rendering.
 */
export interface FontCatalogConfig {
    url: string;
    name: string;
}

/**
 * Create a specific light for lightening the map.
 */
export function createLight(lightDescription: Light): THREE.Light {
    switch (lightDescription.type) {
        case "ambient": {
            const light = new THREE.AmbientLight(
                lightDescription.color,
                lightDescription.intensity
            );
            light.name = lightDescription.name;
            return light;
        }
        case "directional": {
            const light = new THREE.DirectionalLight(
                lightDescription.color,
                lightDescription.intensity
            );
            light.name = lightDescription.name;
            if (lightDescription.castShadow !== undefined) {
                light.castShadow = lightDescription.castShadow;
            }
            light.position.set(
                lightDescription.direction.x,
                lightDescription.direction.y,
                lightDescription.direction.z
            );
            light.position.normalize();
            return light;
        }
    }
}

/**
 * Combine data from datasource and apply the rules from a specified theme to show it on the map.
 */
export class StyleSetEvaluator {
    private readonly m_renderOrderBiasGroups: Map<string, number>;

    private readonly m_techniques: Technique[];

    constructor(readonly styleSet: StyleSet, readonly validate?: boolean) {
        this.m_renderOrderBiasGroups = new Map<string, number>();
        this.m_techniques = new Array<Technique>();

        let techniqueRenderOrder = 0;

        const computeDefaultRenderOrder = (style: Style): void => {
            if (style.renderOrderBiasGroup !== undefined) {
                const renderOrderBiasGroupOrder = style.renderOrderBiasGroup
                    ? this.m_renderOrderBiasGroups.get(style.renderOrderBiasGroup)
                    : undefined;

                if (
                    style.renderOrderBiasRange !== undefined &&
                    renderOrderBiasGroupOrder === undefined
                ) {
                    if (style.renderOrder !== undefined) {
                        logger.warn(
                            "WARN: style.renderOrder will be overridden if " +
                                "renderOrderBiasGroup is set:",
                            style
                        );
                    }

                    const [minRange, maxRange] = style.renderOrderBiasRange;
                    style.renderOrder =
                        minRange < 0
                            ? techniqueRenderOrder + Math.abs(minRange)
                            : techniqueRenderOrder;

                    techniqueRenderOrder += Math.abs(minRange) + maxRange;

                    if (style.renderOrderBiasGroup) {
                        this.m_renderOrderBiasGroups.set(
                            style.renderOrderBiasGroup,
                            style.renderOrder
                        );
                    }
                    techniqueRenderOrder++;
                } else if (renderOrderBiasGroupOrder) {
                    if (style.renderOrder !== undefined) {
                        logger.warn(
                            "WARN: style.renderOrder will be overridden if " +
                                "renderOrderBiasGroup is set:",
                            style
                        );
                    }

                    style.renderOrder = renderOrderBiasGroupOrder;
                }
            }

            // search through child styles
            if (style.styles !== undefined) {
                // TODO: Do proper validation (somewhere else). See HARP-732
                if (this.validate) {
                    if (!Array.isArray(style.styles)) {
                        logger.error("ERROR: style.styles must be an Array:", style);
                    }
                }

                for (const currStyle of style.styles) {
                    computeDefaultRenderOrder(currStyle);
                }
            } else {
                if (style.technique !== undefined) {
                    if (style.attr !== undefined && style.attr.renderOrder === undefined) {
                        style.attr._renderOrderAuto = techniqueRenderOrder++;
                    }
                }
            }
        };

        for (const style of styleSet) {
            computeDefaultRenderOrder(style);
        }
    }

    /**
     * Find all techniques that fit the current objects' environment.
     * *The techniques in the resulting array may not be modified* since they are being reused for
     * identical objects.
     *
     * @param env The objects environment, i.e. the attributes that are relevant for its
     * representation.
     */
    getMatchingTechniques(env: MapEnv): Technique[] {
        const result: Technique[] = [];

        const styleStack = new Array<Style>();

        for (const currStyle of this.styleSet) {
            if (this.validate && styleStack.length !== 0) {
                throw new Error("Internal error: style stack cleanup failed");
            }

            if (this.processStyle(env, styleStack, currStyle, result)) {
                break;
            }
        }

        return result;
    }

    /**
     * Add a technique to the current array of techniques. Add its index to the style, so next time
     * the technique can be found directly from this index.
     *
     * @param style Style that defines technique
     * @param technique Technique to add
     */
    private checkAddTechnique(style: Style, technique: Technique): number {
        let index = style._index === undefined ? -1 : style._index;

        if (index < 0) {
            technique._index = index = this.m_techniques.length;

            this.m_techniques.push(technique);

            style._index = index;
        } else {
            technique._index = index;
        }

        return index;
    }

    /**
     * Get the (current) array of techniques that have been created during decoding.
     */
    get techniques(): Technique[] {
        return this.m_techniques;
    }

    /**
     * Shorten the style object for debug log. Remove special strings (starting with "_") as well
     * as the sub-styles of style groups.
     *
     * @param key Key in object
     * @param value value in object
     */
    private cleanupStyle(key: string, value: any): any {
        // Filtering out properties
        if (key === "styles") {
            return "[...]";
        }
        if (key.startsWith("_")) {
            return undefined;
        }
        return value;
    }

    /**
     * Process a style (and its sub-styles) hierarchically to look for the technique that fits the
     * current objects' environment. The attributes of the styles are assembled to create a unique
     * technique for every object.
     *
     * @param env The objects environment, i.e. the attributes that are relevant for its
     *            representation.
     * @param styleStack Stack of styles containing the hierarchy of styles up to this point.
     * @param style Current style (could also be top of stack).
     * @param result The array of resulting techniques. There may be more than one technique per
     *               object, resulting in multiple graphical objects for representation.
     * @returns `true` if style has been found and processing is finished. `false` if not found, or
     *          more than one technique should be applied.
     */
    private processStyle(
        env: MapEnv,
        styleStack: Style[],
        style: Style,
        result: Technique[]
    ): boolean {
        if (style.when !== undefined) {
            // optimization: Lazy evaluation of when-expression
            if (style._whenExpr === undefined) {
                style._whenExpr = Expr.parse(style.when);
            }

            if (!style._whenExpr.evaluate(env)) {
                return false;
            }
        }

        // search through sub-styles
        if (style.styles !== undefined) {
            if (style.debug) {
                logger.log(
                    "\n======== style group =========\nenv:",
                    JSON.stringify(env.unmap(), undefined, 2),
                    "\nstyle group:",
                    JSON.stringify(style, this.cleanupStyle, 2)
                );
            }

            styleStack.push(style);

            // TODO: Do proper validation (somewhere else). See HARP-732
            if (this.validate) {
                if (!Array.isArray(style.styles)) {
                    logger.error("ERROR: style.styles must be an Array:", style);
                    styleStack.pop();
                    return false;
                }
            }

            for (const currStyle of style.styles) {
                if (this.processStyle(env, styleStack, currStyle, result)) {
                    styleStack.pop();
                    return true;
                }
            }

            styleStack.pop();
        } else {
            // we found a technique!
            if (style.technique !== undefined) {
                // check if we already assembled the technique for exactly this style. If we have,
                // we return the preassembled technique object. Otherwise we assemble the technique
                // from all parent styles' attributes and the current stales' attributes, and add it
                // to the cached techniques.
                if (style._index === undefined) {
                    const technique = {} as any;

                    technique.name = style.technique;

                    const addAttributes = (currStyle: Style) => {
                        if (currStyle.renderOrder !== undefined) {
                            technique.renderOrder = currStyle.renderOrder;
                        }

                        if (currStyle.transient !== undefined) {
                            technique.transient = currStyle.transient;
                        }

                        if (currStyle.renderOrderBiasProperty !== undefined) {
                            technique.renderOrderBiasProperty = currStyle.renderOrderBiasProperty;
                        }

                        if (currStyle.labelProperty !== undefined) {
                            technique.label = currStyle.labelProperty;
                        }

                        if (currStyle.renderOrderBiasRange !== undefined) {
                            technique.renderOrderBiasRange = currStyle.renderOrderBiasRange;
                        }

                        if (currStyle.renderOrderBiasGroup !== undefined) {
                            technique.renderOrderBiasGroup = currStyle.renderOrderBiasGroup;
                        }

                        if (currStyle.attr !== undefined) {
                            Object.getOwnPropertyNames(currStyle.attr).forEach(property => {
                                // check for valid attr keys
                                // TODO: Do proper validation (somewhere else). See HARP-732
                                if (this.validate) {
                                    if (property === "technique") {
                                        logger.warn(
                                            "WARNING: technique defined in attr " + "(deprecated):",
                                            currStyle
                                        );
                                    } else if (property === "renderOrder") {
                                        logger.warn(
                                            "WARNING: renderOrder defined in attr " +
                                                "(deprecated):",
                                            currStyle
                                        );
                                    }
                                }

                                if (currStyle.attr !== undefined) {
                                    const prop = currStyle.attr[property];
                                    if (isInterpolatedPropertyDefinition(prop)) {
                                        switch (typeof prop.values[0]) {
                                            default:
                                            case "number":
                                                technique[property] = createInterpolatedProperty(
                                                    prop as InterpolatedPropertyDefinition<number>
                                                );
                                                break;
                                            case "boolean":
                                                technique[property] = createInterpolatedProperty(
                                                    prop as InterpolatedPropertyDefinition<boolean>
                                                );
                                                break;
                                            case "string":
                                                technique[property] = createInterpolatedProperty(
                                                    prop as InterpolatedPropertyDefinition<string>
                                                );
                                                break;
                                        }
                                    } else {
                                        technique[property] = prop;
                                    }
                                }
                            });
                        }
                    };

                    for (const currStyle of styleStack) {
                        addAttributes(currStyle);
                    }
                    addAttributes(style);

                    this.checkAddTechnique(style, technique);

                    result.push(technique);

                    if (style.debug) {
                        logger.log(
                            "\n======== style w/ technique =========\nenv:",
                            JSON.stringify(env.unmap(), undefined, 2),
                            "\nstyle:",
                            JSON.stringify(style, this.cleanupStyle, 2),
                            "\ntechnique:",
                            JSON.stringify(technique, this.cleanupStyle, 2)
                        );
                    }
                } else {
                    result.push(this.m_techniques[style._index]);
                }

                // stop processing if "final" is set
                return style.final === true;
            } else if (this.validate) {
                logger.warn(
                    "WARNING: No technique defined in style. Either sub-styles or a " +
                        "technique must be defined:",
                    JSON.stringify(style)
                );
            }
        }

        return false;
    }
}

/**
 * The ThemeVisitor visits every style in the theme in a depth-first fashion.
 */
export class ThemeVisitor {
    constructor(readonly theme: Theme) {}

    /**
     * Applies a function to every style in the theme.
     *
     * @param visitFunc Function to be called with `style` as an argument. Function should return
     *                  `true` to cancel visitation.
     * @returns `true` if function has finished prematurely.
     */
    visitStyles(visitFunc: (style: Style) => boolean): boolean {
        const visit = (style: Style): boolean => {
            if (visitFunc(style)) {
                return true;
            }

            if (style.styles !== undefined) {
                for (const currStyle of style.styles) {
                    if (visit(currStyle)) {
                        return true;
                    }
                }
            }
            return false;
        };

        if (this.theme.styles !== undefined) {
            for (const styleSetName in this.theme.styles) {
                if (this.theme.styles[styleSetName] !== undefined) {
                    for (const style of this.theme.styles[styleSetName]) {
                        if (visit(style)) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }
}
