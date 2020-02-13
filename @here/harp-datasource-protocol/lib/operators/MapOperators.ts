/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, ExprScope, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    "ppi-scale": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]) as number;
            const scaleFactor = call.args[1] ? (context.evaluate(call.args[1]) as number) : 1;
            return value * scaleFactor;
        }
    },
    "world-ppi-scale": {
        isDynamicOperator: (): boolean => {
            return true;
        },
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const pixels = context.evaluate(call.args[0]) as number;
            const scaleFactor = call.args[1] ? (context.evaluate(call.args[1]) as number) : 1;
            const zoom = context.env.lookup("$zoom") as number;
            const zoomWidth = Math.pow(2, 17) / Math.pow(2, zoom);
            const v = pixels * zoomWidth * scaleFactor;
            return v;
        }
    },
    "world-discrete-ppi-scale": {
        isDynamicOperator: (): boolean => {
            return true;
        },
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const pixels = context.evaluate(call.args[0]) as number;
            const scaleFactor = call.args[1] ? (context.evaluate(call.args[1]) as number) : 1;
            const zoom = context.env.lookup("$zoom") as number;
            const zoomWidthDiscrete = Math.pow(2, 17.8) / Math.pow(2, Math.floor(zoom));
            const v = pixels * zoomWidthDiscrete * scaleFactor;
            return v;
        }
    },
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
