/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperatorDescriptorMap } from "../ExprEvaluator";

type RelOp = "<" | ">" | "<=" | ">=";

function compare(op: RelOp, actuals: any[], strict: boolean = false) {
    const left = actuals[0];
    const right = actuals[1];

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
        call: (actuals: unknown[]) => !actuals[0]
    },

    "==": {
        call: (actuals: unknown[]) => {
            const left = actuals[0];
            const right = actuals[1];
            return left === right;
        }
    },

    "!=": {
        call: (actuals: unknown[]) => {
            const left = actuals[0];
            const right = actuals[1];
            return left !== right;
        }
    },

    "<": {
        call: (actuals: unknown[]) => compare("<", actuals)
    },

    ">": {
        call: (actuals: unknown[]) => compare(">", actuals)
    },

    "<=": {
        call: (actuals: unknown[]) => compare("<=", actuals)
    },

    ">=": {
        call: (actuals: unknown[]) => compare(">=", actuals)
    }
};

export const ComparisonOperators: OperatorDescriptorMap = operators;
export type ComparisonOperatorNames = keyof typeof operators;
