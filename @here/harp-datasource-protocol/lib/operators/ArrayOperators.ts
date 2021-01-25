/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, Expr, JsonArray, NumberLiteralExpr, StringLiteralExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const VALID_ELEMENT_TYPES = ["boolean", "number", "string"];

function checkElementTypes(arg: Expr, array: JsonArray) {
    if (!(arg instanceof StringLiteralExpr) || !VALID_ELEMENT_TYPES.includes(arg.value)) {
        throw new Error(
            `expected "boolean", "number" or "string" instead of '${JSON.stringify(arg)}'`
        );
    }

    const ty = arg.value;

    array.forEach((element, index) => {
        if (typeof element !== ty) {
            throw new Error(`expected array element at index ${index} to have type '${ty}'`);
        }
    });
}

function checkArrayLength(arg: Expr, array: JsonArray) {
    if (!(arg instanceof NumberLiteralExpr)) {
        throw new Error(`missing expected number of elements`);
    }

    const length = arg.value;

    if (array.length !== length) {
        throw new Error(`the array must have ${length} element(s)`);
    }
}

function checkArray(context: ExprEvaluatorContext, arg: Expr) {
    const value = context.evaluate(arg);
    if (!Array.isArray(value)) {
        throw new Error(`'${value}' is not an array`);
    }
    return value;
}

const operators = {
    array: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            switch (call.args.length) {
                case 0:
                    throw new Error("not enough arguments");
                case 1:
                    return checkArray(context, call.args[0]);
                case 2: {
                    const array = checkArray(context, call.args[1]);
                    checkElementTypes(call.args[0], array);
                    return array;
                }
                case 3: {
                    const array = checkArray(context, call.args[2]);
                    checkArrayLength(call.args[1], array);
                    checkElementTypes(call.args[0], array);
                    return array;
                }
                default:
                    throw new Error("too many arguments");
            }
        }
    },
    "make-array": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            if (call.args.length === 0) {
                throw new Error("not enough arguments");
            }
            return [...call.args.map(arg => context.evaluate(arg))];
        }
    },
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
    },

    slice: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            if (call.args.length < 2) {
                throw new Error("not enough arguments");
            }
            const input = context.evaluate(call.args[0]);
            if (!(typeof input === "string" || Array.isArray(input))) {
                throw new Error("input must be a string or an array");
            }
            const start = context.evaluate(call.args[1]);
            if (typeof start !== "number") {
                throw new Error("expected an index");
            }
            let end: number | undefined;
            if (call.args.length > 2) {
                end = context.evaluate(call.args[2]) as any;
                if (typeof end !== "number") {
                    throw new Error("expected an index");
                }
            }
            return input.slice(start, end);
        }
    }
};

export const ArrayOperators: OperatorDescriptorMap = operators;
export type ArrayOperatorNames = keyof typeof operators;
