/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Value } from "./Env";
import {
    BooleanLiteralExpr,
    CallExpr,
    CaseExpr,
    Expr,
    ExprVisitor,
    HasAttributeExpr,
    InterpolateExpr,
    MatchExpr,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
    StepExpr,
    StringLiteralExpr,
    VarExpr
} from "./Expr";

/**
 * [[ExprPool]] maintains a set of unique interned {@link Expr} objects.
 *
 * @hidden
 */
export class ExprPool implements ExprVisitor<Expr, void> {
    private readonly m_booleanLiterals = new Map<boolean, BooleanLiteralExpr>();
    private readonly m_numberLiterals = new Map<number, NumberLiteralExpr>();
    private readonly m_stringLiterals = new Map<string, StringLiteralExpr>();
    private readonly m_objectLiterals = new Map<object, ObjectLiteralExpr>();
    private readonly m_arrayLiterals: ObjectLiteralExpr[] = [];
    private readonly m_varExprs = new Map<string, VarExpr>();
    private readonly m_hasAttributeExprs = new Map<string, HasAttributeExpr>();
    private readonly m_matchExprs: MatchExpr[] = [];
    private readonly m_caseExprs: CaseExpr[] = [];
    private readonly m_interpolateExprs: InterpolateExpr[] = [];
    private readonly m_stepExprs: StepExpr[] = [];
    private readonly m_callExprs = new Map<string, CallExpr[]>();

    /**
     * Add `expr` to this [[ExprPool]] and return a unique {@link Expr}
     * object that is structurally equivalent to `expr`.
     *
     * @param expr - The {@link Expr} to add to this [[ExprPool]].
     * @returns A unique {@link Expr} that is structurally equivalent to `expr`.
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

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, context: void): Expr {
        const e = this.m_objectLiterals.get(expr.value);
        if (e) {
            return e;
        }

        if (Array.isArray(expr.value)) {
            const array = expr.value as Value[];

            const r = this.m_arrayLiterals.find(literal => {
                const elements = literal.value as Value[];
                if (elements.length !== array.length) {
                    return false;
                }
                return array.every((x, i) => x === elements[i]);
            });

            if (r !== undefined) {
                return r;
            }

            this.m_arrayLiterals.push(expr);
        }

        this.m_objectLiterals.set(expr.value, expr);

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

    visitMatchExpr(expr: MatchExpr, context: void): Expr {
        const value = expr.value.accept(this, context);
        const branches: typeof expr.branches = expr.branches.map(([label, body]) => [
            label,
            body.accept(this, context)
        ]);
        const fallback = expr.fallback.accept(this, context);
        for (const candidate of this.m_matchExprs) {
            if (candidate.value !== value) {
                continue;
            }
            if (candidate.fallback !== fallback) {
                continue;
            }
            if (candidate.branches.length !== branches.length) {
                continue;
            }
            let branchesMatching = true;
            for (let i = 0; i < branches.length; i++) {
                if (
                    branches[i][0] !== candidate.branches[i][0] ||
                    branches[i][1] !== candidate.branches[i][1]
                ) {
                    branchesMatching = false;
                    break;
                }
            }
            if (branchesMatching) {
                return candidate;
            }
        }
        const r = new MatchExpr(value, branches, fallback);
        this.m_matchExprs.push(r);
        return r;
    }

    visitCaseExpr(expr: CaseExpr, context: void): Expr {
        const branches: typeof expr.branches = expr.branches.map(([condition, body]) => [
            condition.accept(this, context),
            body.accept(this, context)
        ]);
        const fallback = expr.fallback.accept(this, context);

        for (const candidate of this.m_caseExprs) {
            if (candidate.fallback !== fallback) {
                continue;
            }
            if (candidate.branches.length !== branches.length) {
                continue;
            }
            let branchesMatching = true;
            for (let i = 0; i < branches.length; i++) {
                if (
                    branches[i][0] !== candidate.branches[i][0] ||
                    branches[i][1] !== candidate.branches[i][1]
                ) {
                    branchesMatching = false;
                    break;
                }
            }
            if (branchesMatching) {
                return candidate;
            }
        }

        const r = new CaseExpr(branches, fallback);
        this.m_caseExprs.push(r);
        return r;
    }

    visitCallExpr(expr: CallExpr, context: void): Expr {
        // rewrite the actual arguments
        const expressions = expr.args.map(childExpr => childExpr.accept(this, context));
        // ensure we have a valid set of interned expressions for the calls
        if (!this.m_callExprs.has(expr.op)) {
            this.m_callExprs.set(expr.op, []);
        }
        // get the calls for the given operator.
        const calls = this.m_callExprs.get(expr.op)!;
        for (const call of calls) {
            // check the number of arguments
            if (call.args.length !== expressions.length) {
                continue;
            }
            // find the index of the first mismatch.
            let index = 0;
            for (; index < call.args.length; ++index) {
                if (call.args[index] !== expressions[index]) {
                    break;
                }
            }
            if (index === call.args.length) {
                // no mismatch found, return the 'interned' call.
                return call;
            }
        }
        const e = new CallExpr(expr.op, expressions);
        e.descriptor = expr.descriptor;
        calls.push(e);
        return e;
    }

    visitStepExpr(expr: StepExpr, context: void): Expr {
        if (this.m_stepExprs.includes(expr)) {
            return expr;
        }
        const input = expr.input.accept(this, context);
        const defaultValue = expr.defaultValue.accept(this, context);
        const stops: Array<[number, Expr]> = expr.stops.map(stop => {
            const key = stop[0];
            const value = stop[1].accept(this, context);
            return value === stop[1] ? stop : [key, value];
        });
        for (const step of this.m_stepExprs) {
            if (
                step.input === input &&
                step.defaultValue === defaultValue &&
                stops.length === step.stops.length &&
                stops.every(
                    ([key, value], i) => key === step.stops[i][0] && value === step.stops[i][1]
                )
            ) {
                return step;
            }
        }
        const e = new StepExpr(input, defaultValue, stops);
        this.m_stepExprs.push(e);
        return e;
    }

    visitInterpolateExpr(expr: InterpolateExpr, context: void): Expr {
        if (this.m_interpolateExprs.includes(expr)) {
            return expr;
        }
        const input = expr.input.accept(this, context);
        const stops: Array<[number, Expr]> = expr.stops.map(stop => {
            const key = stop[0];
            const value = stop[1].accept(this, context);
            return value === stop[1] ? stop : [key, value];
        });
        for (const interp of this.m_interpolateExprs) {
            if (
                interp.input === input &&
                interp.mode[0] === expr.mode[0] &&
                interp.mode[1] === expr.mode[1] &&
                stops.length === interp.stops.length &&
                stops.every(
                    ([key, value], i) => key === interp.stops[i][0] && value === interp.stops[i][1]
                )
            ) {
                return interp;
            }
        }
        const e = new InterpolateExpr(expr.mode, input, stops);
        this.m_interpolateExprs.push(e);
        return e;
    }
}
