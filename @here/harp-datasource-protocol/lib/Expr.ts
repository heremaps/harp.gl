/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
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
 * @hidden
 */
type UnaryOp = "has" | "!";

/**
 * @hidden
 */
type RelationalOp = "<" | ">" | "<=" | ">=";

/**
 * @hidden
 */
type EqualityOp = "~=" | "^=" | "$=" | "==" | "!=";

/**
 * @hidden
 */
type BinaryOp = RelationalOp | EqualityOp;

/**
 * @hidden
 */
type LogicalOp = "&&" | "||";

/**
 * @hidden
 */
type Literal = "boolean" | "number" | "string";

/**
 * @hidden
 */
type ExprKind = "var" | "in" | Literal | UnaryOp | RelationalOp | EqualityOp | LogicalOp;

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

export class Parser {
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
