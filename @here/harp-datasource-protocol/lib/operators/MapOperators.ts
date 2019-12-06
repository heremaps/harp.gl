/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExprScope, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    ppi: {
        call: (context: ExprEvaluatorContext) => {
            const ppi = context.env.lookup("$ppi");
            if (typeof ppi === "number") {
                return ppi;
            }
            return 72;
        }
    },
    zoom: {
        isDynamicOperator: (): boolean => {
            return true;
        },
        call: (context: ExprEvaluatorContext): Value => {
            if (context.scope === ExprScope.Condition) {
                const zoom = context.env.lookup("$zoom")!;
                if (zoom !== undefined) {
                    return zoom;
                }
                throw new Error("failed to get the zoom level.");
            }
            // direct usages of 'zoom' outside technique filter conditions
            // and interpolations are not allowed.
            throw new Error("invalid usage of the 'zoom' operator.");
        }
    }
};

export const MapOperators: OperatorDescriptorMap = operators;
export type MapOperatorNames = keyof typeof operators;
