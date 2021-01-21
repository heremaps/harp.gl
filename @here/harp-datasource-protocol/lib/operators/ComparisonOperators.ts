/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

function compare(context: ExprEvaluatorContext, call: CallExpr, strict: boolean = false) {
    const left = context.evaluate(call.args[0]) as any;
    const right = context.evaluate(call.args[1]) as any;

    if (
        !(
            (typeof left === "number" && typeof right === "number") ||
            (typeof left === "string" && typeof right === "string")
        )
    ) {
        if (strict) {
            throw new Error(`invalid operands '${left}' and '${right}' for operator '${call.op}'`);
        }
    }

    switch (call.op) {
        case "<":
            return left < right;
        case ">":
            return left > right;
        case "<=":
            return left <= right;
        case ">=":
            return left >= right;
        default:
            throw new Error(`invalid comparison operator '${call.op}'`);
    }
}

const operators = {
    "!": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return !context.evaluate(call.args[0]);
        }
    },

    "==": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            return left === right;
        }
    },

    "!=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            return left !== right;
        }
    },

    "<": { call: (context: ExprEvaluatorContext, call: CallExpr) => compare(context, call) },
    ">": { call: (context: ExprEvaluatorContext, call: CallExpr) => compare(context, call) },
    "<=": { call: (context: ExprEvaluatorContext, call: CallExpr) => compare(context, call) },
    ">=": { call: (context: ExprEvaluatorContext, call: CallExpr) => compare(context, call) }
};

export const ComparisonOperators: OperatorDescriptorMap = operators;
export type ComparisonOperatorNames = keyof typeof operators;
