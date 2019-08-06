/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    "to-boolean": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return Boolean(context.evaluate(args[0]));
        }
    },

    "to-string": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return String(context.evaluate(args[0]));
        }
    },

    "to-number": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            for (const arg of args) {
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
