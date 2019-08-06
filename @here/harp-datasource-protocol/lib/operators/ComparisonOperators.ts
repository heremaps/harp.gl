/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

type RelOp = "<" | ">" | "<=" | ">=";

function compare(
    context: ExprEvaluatorContext,
    op: RelOp,
    actuals: Expr[],
    strict: boolean = false
) {
    const left = context.evaluate(actuals[0]) as any;
    const right = context.evaluate(actuals[1]) as any;

    if (
        !(
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        )
    ) {
        if (strict) {
            throw new Error(`invalid operands '${left}' and '${right}' for operator '${op}'`);
        }
    }

    switch (op) {
        case "<":
            return left < right;
        case ">":
            return left > right;
        case "<=":
            return left <= right;
        case ">=":
            return left >= right;
        default:
            throw new Error(`invalid comparison operator '${op}'`);
    }
}

const operators = {
    "!": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return !context.evaluate(args[0]);
        }
    },

    "==": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const left = context.evaluate(args[0]);
            const right = context.evaluate(args[1]);
            return left === right;
        }
    },

    "!=": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const left = context.evaluate(args[0]);
            const right = context.evaluate(args[1]);
            return left !== right;
        }
    },

    "<": { call: (context: ExprEvaluatorContext, args: Expr[]) => compare(context, "<", args) },
    ">": { call: (context: ExprEvaluatorContext, args: Expr[]) => compare(context, ">", args) },
    "<=": { call: (context: ExprEvaluatorContext, args: Expr[]) => compare(context, "<=", args) },
    ">=": { call: (context: ExprEvaluatorContext, args: Expr[]) => compare(context, ">=", args) }
};

export const ComparisonOperators: OperatorDescriptorMap = operators;
export type ComparisonOperatorNames = keyof typeof operators;
