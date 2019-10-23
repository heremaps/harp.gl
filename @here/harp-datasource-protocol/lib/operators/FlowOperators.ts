/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

function conditionalCast(context: ExprEvaluatorContext, type: string, args: Expr[]) {
    switch (type) {
        case "boolean":
        case "number":
        case "string":
            for (const childExpr of args) {
                const value = context.evaluate(childExpr);
                if (typeof value === type) {
                    return value;
                }
            }
            throw new Error(`expected a '${type}'`);
        default:
            throw new Error(`invalid type '${type}'`);
    } // switch
}

const operators = {
    boolean: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return conditionalCast(context, "boolean", call.args);
        }
    },

    number: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return conditionalCast(context, "number", call.args);
        }
    },

    string: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return conditionalCast(context, "string", call.args);
        }
    }
};

export const FlowOperators: OperatorDescriptorMap = operators;
export type FlowOperatorNames = keyof typeof operators;
