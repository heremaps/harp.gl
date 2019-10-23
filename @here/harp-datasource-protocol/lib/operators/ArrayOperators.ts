/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    at: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const args = call.args;
            const index = context.evaluate(args[0]);
            if (typeof index !== "number") {
                throw new Error(`expected the index of the element to retrieve`);
            }
            const value = context.evaluate(args[1]);
            if (!Array.isArray(value)) {
                throw new Error(`expected an array`);
            }
            return index >= 0 && index < value.length ? value[index] : null;
        }
    }
};

export const ArrayOperators: OperatorDescriptorMap = operators;
export type ArrayOperatorNames = keyof typeof operators;
