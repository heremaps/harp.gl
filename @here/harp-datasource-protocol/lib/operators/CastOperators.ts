/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    "to-boolean": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return Boolean(context.evaluate(call.args[0]));
        }
    },

    "to-string": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return String(context.evaluate(call.args[0]));
        }
    },

    "to-number": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            for (const arg of call.args) {
                const value = Number(context.evaluate(arg));
                if (!isNaN(value)) {
                    return value;
                }
            }
            throw new Error("cannot convert the value to a number");
        }
    }
};

export const CastOperators: OperatorDescriptorMap = operators;
export type CastOperatorNames = keyof typeof operators;
