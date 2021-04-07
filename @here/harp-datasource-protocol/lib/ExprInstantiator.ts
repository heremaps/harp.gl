/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from "./Env";
import {
    BooleanLiteralExpr,
    CallExpr,
    CaseExpr,
    Expr,
    ExprScope,
    ExprVisitor,
    HasAttributeExpr,
    InterpolateExpr,
    LiteralExpr,
    MatchExpr,
    MatchLabel,
    NullLiteralExpr,
    NumberLiteralExpr,
    ObjectLiteralExpr,
    StepExpr,
    StringLiteralExpr,
    VarExpr
} from "./Expr";

export interface InstantiationContext {
    /**
     * The {@link Env} used to lookup for names.
     */
    env: Env;

    /**
     * The names to preserve during the instantiation.
     */
    preserve?: Set<string>;
}

const emptyEnv = new Env();

/**
 * @hidden
 */
export class ExprInstantiator implements ExprVisitor<Expr, InstantiationContext> {
    visitNullLiteralExpr(expr: NullLiteralExpr, _context: InstantiationContext): Expr {
        return expr;
    }

    visitBooleanLiteralExpr(expr: BooleanLiteralExpr, _context: InstantiationContext): Expr {
        return expr;
    }

    visitNumberLiteralExpr(expr: NumberLiteralExpr, _context: InstantiationContext): Expr {
        return expr;
    }

    visitStringLiteralExpr(expr: StringLiteralExpr, _context: InstantiationContext): Expr {
        return expr;
    }

    visitObjectLiteralExpr(expr: ObjectLiteralExpr, _context: InstantiationContext): Expr {
        return expr;
    }

    visitVarExpr(expr: VarExpr, context: InstantiationContext): Expr {
        if (context.preserve && context.preserve.has(expr.name)) {
            return expr;
        }
        const value = context.env.lookup(expr.name);
        return LiteralExpr.fromValue(value !== undefined ? value : null);
    }

    visitHasAttributeExpr(expr: HasAttributeExpr, context: InstantiationContext): Expr {
        if (context.preserve && context.preserve.has(expr.name)) {
            return expr;
        }
        const value = context.env.lookup(expr.name) !== undefined;
        return LiteralExpr.fromValue(value);
    }

    visitCallExpr(expr: CallExpr, context: InstantiationContext): Expr {
        const args = expr.args.map(arg => arg.accept(this, context));
        if (args.some((a, i) => a !== expr.args[i])) {
            return new CallExpr(expr.op, args);
        }
        return expr;
    }

    visitMatchExpr(match: MatchExpr, context: InstantiationContext): Expr {
        const value = match.value.accept(this, context);

        if (value instanceof LiteralExpr) {
            const r = value.value;
            for (const [label, body] of match.branches) {
                if (Array.isArray(label) && (label as any[]).includes(r)) {
                    return body.accept(this, context);
                } else if (label === r) {
                    return body.accept(this, context);
                }
            }
            return match.fallback.accept(this, context);
        }

        let changed = match.value !== value;

        const branches: Array<[MatchLabel, Expr]> = match.branches.map(([label, branch]) => {
            const newBranch = branch.accept(this, context);
            if (newBranch !== branch) {
                changed = true;
            }
            return [label, newBranch];
        });

        const fallback = match.fallback.accept(this, context);

        if (fallback !== match.fallback) {
            changed = true;
        }

        return changed ? new MatchExpr(value, branches, fallback) : match;
    }

    visitCaseExpr(expr: CaseExpr, context: InstantiationContext): Expr {
        const branches: Array<[Expr, Expr]> = [];

        let changed = false;

        for (const [condition, branch] of expr.branches) {
            const newCondition = condition.accept(this, context);
            const deps = newCondition.dependencies();
            if (!condition.isDynamic() && deps.properties.size === 0) {
                if (Boolean(newCondition.evaluate(emptyEnv, ExprScope.Condition))) {
                    return branch.accept(this, context);
                }
            } else {
                if (newCondition !== condition) {
                    changed = true;
                }
                branches.push([newCondition, branch]);
            }
        }

        if (branches.length === 0) {
            // all the conditions of this CaseExpr evaluated
            // to false, so the resulting of instantiating this CaseExpr
            // is the same as instantiating its fallback expression.
            return expr.fallback.accept(this, context);
        }

        if (branches.length !== expr.branches.length) {
            // the number of branches changed, this means that
            // some of the branches had constant expressions that
            // evaluate to false. In this case the resulting
            // `CaseExpr` has less branches.
            changed = true;
        }

        // Instantiate the body of all the branches of this CaseExpr
        // that have dynamic conditions.
        branches.forEach(branch => {
            const instantiatedBranch = branch[1].accept(this, context);

            if (instantiatedBranch !== branch[1]) {
                changed = true;
            }

            branch[1] = instantiatedBranch;
        });

        const fallback = expr.fallback.accept(this, context);

        if (fallback !== expr.fallback) {
            changed = true;
        }

        if (!changed) {
            // nothing changed, return the old expression.
            return expr;
        }

        return new CaseExpr(branches, fallback);
    }

    visitStepExpr(expr: StepExpr, context: InstantiationContext): Expr {
        const input = expr.input.accept(this, context);
        const defaultValue = expr.defaultValue.accept(this, context);
        const stops: Array<[number, Expr]> = expr.stops.map(([key, value]) => [
            key,
            value.accept(this, context)
        ]);
        return new StepExpr(input, defaultValue, stops);
    }

    visitInterpolateExpr(expr: InterpolateExpr, context: InstantiationContext): Expr {
        const input = expr.input.accept(this, context);
        const stops: Array<[number, Expr]> = expr.stops.map(([key, value]) => [
            key,
            value.accept(this, context)
        ]);
        return new InterpolateExpr(expr.mode, input, stops);
    }
}
