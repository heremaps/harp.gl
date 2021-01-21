/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    length: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (Array.isArray(value) || typeof value === "string") {
                return value.length;
            }
            throw new Error(`invalid operand '${value}' for operator 'length'`);
        }
    },
    coalesce: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            for (const childExpr of call.args) {
                const value = context.evaluate(childExpr);
                if (value !== null) {
                    return value;
                }
            }
            return null;
        }
    }
};

export const MiscOperators: OperatorDescriptorMap = operators;
export type MiscOperatorNames = keyof typeof operators;
