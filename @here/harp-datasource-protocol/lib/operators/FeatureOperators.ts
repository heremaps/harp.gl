/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from "../Env";
import { CallExpr, ExprScope } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    "geometry-type": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const geometryType = context.env.lookup("$geometryType");
            switch (geometryType) {
                case "point":
                    return "Point";
                case "line":
                    return "LineString";
                case "polygon":
                    return "Polygon";
                default:
                    return null;
            }
        }
    },
    "feature-state": {
        isDynamicOperator: () => true,
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            if (context.scope !== ExprScope.Dynamic) {
                throw new Error("feature-state cannot be used in this context");
            }
            const property = context.evaluate(call.args[0]);
            if (typeof property !== "string") {
                throw new Error(`expected the name of the property of the feature state`);
            }
            const state = context.env.lookup("$state");
            if (Env.isEnv(state)) {
                return state.lookup(property) ?? null;
            } else if (state instanceof Map) {
                return state.get(property) ?? null;
            }
            return null;
        }
    },
    id: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return context.env.lookup("$id") ?? null;
        }
    }
};

export const FeatureOperators: OperatorDescriptorMap = operators;
export type FeatureOperatorNames = keyof typeof operators;
