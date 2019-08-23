/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BooleanLiteralExpr,
    CallExpr,
    ContainsExpr,
    Expr,
    ExprVisitor,
    HasAttributeExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    StringLiteralExpr,
    VarExpr
} from "./Expr";

/**
 * [[ExprPool]] maintains a set of unique interned [[Expr]] objects.
 *
 * @hidden
 */
export class ExprPool implements ExprVisitor<Expr, void> {
    private readonly m_booleanLiterals = new Map<boolean, BooleanLiteralExpr>();
    private readonly m_numberLiterals = new Map<number, NumberLiteralExpr>();
    private readonly m_stringLiterals = new Map<string, StringLiteralExpr>();
    private readonly m_varExprs = new Map<string, VarExpr>();
    private readonly m_hasAttributeExprs = new Map<string, HasAttributeExpr>();
    private readonly m_inExprs = new Map<Expr, ContainsExpr[]>();
    private readonly m_callExprs = new Map<string, CallExpr[]>();

    /**
     * Add `expr` to this [[ExprPool]] and return a unique [[Expr]]
     * object that is structurally equivalent to `expr`.
     *
     * @param expr The [[Expr]] to add to this [[ExprPool]].
     * @returns A unique [[Expr]] that is structurally equivalent to `expr`.
     */
    add(expr: Expr): Expr {
        return expr.accept(this, undefined);
    }

    visitNullLiteralExpr(expr: NullLiteralExpr, context: void): Expr {
        return NullLiteralExpr.instance;
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, context: void): Expr {
        const e = this.m_booleanLiterals.get(expr.value);
        if (e) {
            return e;
        }
        this.m_booleanLiterals.set(expr.value, expr);
        return expr;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, context: void): Expr {
        const e = this.m_numberLiterals.get(expr.value);
        if (e) {
            return e;
        }
        this.m_numberLiterals.set(expr.value, expr);
        return expr;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, context: void): Expr {
        const e = this.m_stringLiterals.get(expr.value);
        if (e) {
            return e;
        }
        this.m_stringLiterals.set(expr.value, expr);
        return expr;
    }

    visitVarExpr(expr: VarExpr, context: void): Expr {
        const e = this.m_varExprs.get(expr.name);
        if (e) {
            return e;
        }
        this.m_varExprs.set(expr.name, expr);
        return expr;
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: void): Expr {
        const e = this.m_hasAttributeExprs.get(expr.name);
        if (e) {
            return e;
        }
        this.m_hasAttributeExprs.set(expr.name, expr);
        return expr;
    }

    visitContainsExpr(expr: ContainsExpr, context: void): Expr {
        const value = expr.value.accept(this, context);
        if (!this.m_inExprs.has(value)) {
            this.m_inExprs.set(value, []);
        }
        const inExprs = this.m_inExprs.get(value)!;
        for (const inExpr of inExprs) {
            if (inExpr.elements.length !== expr.elements.length) {
                continue;
            }
            // find the index of the first element in the cached 'in' expr
            // that is not contained in 'expr.elements'.
            const i = inExpr.elements.findIndex(x => !expr.elements.includes(x));
            if (i === -1) {
                return inExpr;
            }
        }
        const e = new ContainsExpr(value, expr.elements);
        this.m_inExprs.set(value, [e]);
        return e;
    }

    visitMatchExpr(expr: MatchExpr, context: void): Expr {
        return expr;
    }

    visitCallExpr(expr: CallExpr, context: void): Expr {
        // rewrite the actual arguments
        const expressions = expr.children.map(childExpr => childExpr.accept(this, context));
        // ensure we have a valid set of interned expressions for the calls
        if (!this.m_callExprs.has(expr.op)) {
            this.m_callExprs.set(expr.op, []);
        }
        // get the calls for the given operator.
        const calls = this.m_callExprs.get(expr.op)!;
        for (const call of calls) {
            // check the number of arguments
            if (call.children.length !== expressions.length) {
                continue;
            }
            // find the index of the first mismatch.
            let index = 0;
            for (; index < call.children.length; ++index) {
                if (call.children[index] !== expressions[index]) {
                    break;
                }
            }
            if (index === call.children.length) {
                // no mismatch found, return the 'interned' call.
                return call;
            }
        }
        const e = new CallExpr(expr.op, expressions);
        calls.push(e);
        return e;
    }
}
