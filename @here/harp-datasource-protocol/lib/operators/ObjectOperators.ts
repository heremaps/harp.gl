/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Expr, StringLiteralExpr } from "../Expr";

import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const hasOwnProperty = Object.prototype.hasOwnProperty;

enum LookupMode {
    get,
    has
}

function lookupMember(context: ExprEvaluatorContext, args: Expr[], lookupMode: LookupMode) {
    const memberName = args[0];

    if (!(memberName instanceof StringLiteralExpr)) {
        throw new Error(`expected the name of an attribute`);
    }

    const object = context.evaluate(args[1]) as any;

    if (object && typeof object === "object" && hasOwnProperty.call(object, memberName.value)) {
        return lookupMode === LookupMode.get ? object[memberName.value] : true;
    }

    return lookupMode === LookupMode.get ? null : false;
}

const operators = {
    get: {
        call: (context: ExprEvaluatorContext, args: Expr[]) =>
            lookupMember(context, args, LookupMode.get)
    },

    has: {
        call: (context: ExprEvaluatorContext, args: Expr[]) =>
            lookupMember(context, args, LookupMode.has)
    }
};

export const ObjectOperators: OperatorDescriptorMap = operators;
export type ObjectOperatorNames = keyof typeof operators;
