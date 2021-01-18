/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CallExpr,
    EqualityOp,
    Expr,
    HasAttributeExpr,
    LiteralExpr,
    NumberLiteralExpr,
    RelationalOp,
    StringLiteralExpr,
    VarExpr
} from "./Expr";

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
        return this.m_text ?? "";
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
        this.m_char = this.code.codePointAt(this.m_index++) ?? 0;
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

export class ExprParser {
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
                switch (text) {
                    case "has":
                        this.lex.next(); // skip has keyword
                        this.yyexpect(Token.LParen);
                        const hasAttribute = this.lex.text();
                        this.yyexpect(Token.Identifier);
                        this.yyexpect(Token.RParen);
                        return new HasAttributeExpr(hasAttribute);
                    case "length":
                        this.lex.next(); // skip length keyword
                        this.yyexpect(Token.LParen);
                        const value = this.parseLogicalOr();
                        this.yyexpect(Token.RParen);
                        return new CallExpr("length", [value]);
                    default:
                        const expr = new VarExpr(text);
                        this.lex.next();
                        return expr;
                }
            }

            case Token.LParen: {
                this.lex.next();
                const expr = this.parseLogicalOr();
                this.yyexpect(Token.RParen);
                return expr;
            }

            default:
                return this.parseLiteral();
        } // switch
    }

    private parseLiteral(): NumberLiteralExpr | StringLiteralExpr | never {
        switch (this.lex.token()) {
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
            default:
                throw new Error("Syntax error");
        } // switch
    }

    private parseUnary(): Expr | never {
        if (this.lex.token() === Token.Exclaim) {
            this.lex.next();
            return new CallExpr("!", [this.parseUnary()]);
        }
        return this.parsePrimary();
    }

    private parseRelational(): Expr | never {
        let expr = this.parseUnary();
        while (true) {
            if (this.lex.token() === Token.Identifier && this.lex.text() === "in") {
                this.lex.next();
                this.yyexpect(Token.LBracket);
                const elements = [this.parseLiteral()];
                while (this.lex.token() === Token.Comma) {
                    this.lex.next();
                    elements.push(this.parseLiteral());
                }
                this.yyexpect(Token.RBracket);
                expr = new CallExpr("in", [
                    expr,
                    LiteralExpr.fromValue(elements.map(({ value }) => value))
                ]);
            } else {
                const op = getRelationalOp(this.lex.token());
                if (op === undefined) {
                    break;
                }
                this.lex.next();
                const right = this.parseUnary();
                expr = new CallExpr(op, [expr, right]);
            }
        }
        return expr;
    }

    private parseEquality(): Expr | never {
        let expr = this.parseRelational();
        while (true) {
            let op: string | undefined = getEqualityOp(this.lex.token());

            if (op === undefined) {
                break;
            }

            if (op === "~=") {
                op = "in";
            }

            this.lex.next();
            const right = this.parseRelational();
            expr = new CallExpr(op, [expr, right]);
        }
        return expr;
    }

    private parseLogicalAnd(): Expr | never {
        const expr = this.parseEquality();

        if (this.lex.token() !== Token.AmpAmp) {
            return expr;
        }

        const expressions: Expr[] = [expr];

        do {
            this.lex.next();
            expressions.push(this.parseEquality());
        } while (this.lex.token() === Token.AmpAmp);

        return new CallExpr("all", expressions);
    }

    private parseLogicalOr(): Expr | never {
        const expr = this.parseLogicalAnd();

        if (this.lex.token() !== Token.BarBar) {
            return expr;
        }

        const expressions: Expr[] = [expr];

        do {
            this.lex.next();
            expressions.push(this.parseLogicalAnd());
        } while (this.lex.token() === Token.BarBar);

        return new CallExpr("any", expressions);
    }
}
