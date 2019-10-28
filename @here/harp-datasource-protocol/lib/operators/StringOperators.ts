/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    concat: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return "".concat(...call.args.map(a => String(context.evaluate(a))));
        }
    },

    downcase: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return String(context.evaluate(call.args[0])).toLocaleLowerCase();
        }
    },

    upcase: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return String(context.evaluate(call.args[0])).toLocaleUpperCase();
        }
    },

    "~=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.indexOf(right) !== -1;
            }
            return false;
        }
    },

    "^=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.startsWith(right);
            }
            return false;
        }
    },

    "$=": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const left = context.evaluate(call.args[0]);
            const right = context.evaluate(call.args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.endsWith(right);
            }
            return false;
        }
    }
};

export const StringOperators: OperatorDescriptorMap = operators;
export type StringOperatorNames = keyof typeof operators;
