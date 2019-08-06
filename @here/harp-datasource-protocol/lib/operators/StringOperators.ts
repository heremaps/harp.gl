/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    concat: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return "".concat(...args.map(a => String(context.evaluate(a))));
        }
    },

    downcase: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return String(context.evaluate(args[0])).toLocaleLowerCase();
        }
    },

    upcase: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return String(context.evaluate(args[0])).toLocaleUpperCase();
        }
    },

    "~=": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const left = context.evaluate(args[0]);
            const right = context.evaluate(args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.indexOf(right) !== -1;
            }
            return false;
        }
    },

    "^=": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const left = context.evaluate(args[0]);
            const right = context.evaluate(args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.startsWith(right);
            }
            return false;
        }
    },

    "$=": {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            const left = context.evaluate(args[0]);
            const right = context.evaluate(args[1]);
            if (typeof left === "string" && typeof right === "string") {
                return left.endsWith(right);
            }
            return false;
        }
    }
};

export const StringOperators: OperatorDescriptorMap = operators;
export type StringOperatorNames = keyof typeof operators;
