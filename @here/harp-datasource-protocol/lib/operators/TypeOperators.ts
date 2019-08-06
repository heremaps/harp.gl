/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    typeof: {
        call: (context: ExprEvaluatorContext, args: Expr[]) => {
            return typeof context.evaluate(args[0]);
        }
    }
};

export const TypeOperators: OperatorDescriptorMap = operators;
export type TypeOperatorNames = keyof typeof operators;
