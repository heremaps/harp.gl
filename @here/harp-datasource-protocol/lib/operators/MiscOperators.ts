/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    length: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const value = context.evaluate(args[0]);
            if (Array.isArray(value) || typeof value === "string") {
                return value.length;
            }
            throw new Error(`invalid operand '${value}' for operator 'length'`);
        }
    },
    coalesce: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            for (const childExpr of args) {
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
