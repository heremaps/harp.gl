/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, Expr } from "../Expr";

import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const hasOwnProperty = Object.prototype.hasOwnProperty;

enum LookupMode {
    get,
    has
}

function lookupMember(context: ExprEvaluatorContext, args: Expr[], lookupMode: LookupMode) {
    const memberName = context.evaluate(args[0]);

    if (typeof memberName !== "string") {
        throw new Error(`expected the name of an attribute`);
    }

    const object = context.evaluate(args[1]) as any;

    if (object && typeof object === "object" && hasOwnProperty.call(object, memberName)) {
        return lookupMode === LookupMode.get ? object[memberName] : true;
    }

    return lookupMode === LookupMode.get ? null : false;
}

const operators = {
    get: {
        call: (context: ExprEvaluatorContext, call: CallExpr) =>
            lookupMember(context, call.args, LookupMode.get)
    },

    has: {
        call: (context: ExprEvaluatorContext, call: CallExpr) =>
            lookupMember(context, call.args, LookupMode.has)
    }
};

export const ObjectOperators: OperatorDescriptorMap = operators;
export type ObjectOperatorNames = keyof typeof operators;
