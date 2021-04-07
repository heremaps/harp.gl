/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    typeof: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return typeof context.evaluate(call.args[0]);
        }
    }
};

export const TypeOperators: OperatorDescriptorMap = operators;
export type TypeOperatorNames = keyof typeof operators;
