/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { CallExpr } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    "^": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const a = context.evaluate(call.args[0]);
            const b = context.evaluate(call.args[1]);
            if (typeof a !== "number" || typeof b !== "number") {
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '^'`
                );
            }
            return Math.pow(a, b);
        }
    },

    "-": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            if (call.args.length === 1) {
                const value = context.evaluate(call.args[0]);
                if (typeof value !== "number") {
                    throw new Error(`ìnvalid operand '${typeof value} for operator '-'`);
                }

                return -value;
            }

            const a = context.evaluate(call.args[0]);
            const b = context.evaluate(call.args[1]);
            if (typeof a !== "number" || typeof b !== "number") {
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '-'`
                );
            }
            return a - b;
        }
    },

    "/": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const a = context.evaluate(call.args[0]);
            const b = context.evaluate(call.args[1]);
            if (typeof a !== "number" || typeof b !== "number") {
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '/'`
                );
            }
            return a / b;
        }
    },

    "%": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const a = context.evaluate(call.args[0]);
            const b = context.evaluate(call.args[1]);
            if (typeof a !== "number" || typeof b !== "number") {
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '%'`
                );
            }
            return a % b;
        }
    },

    "+": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return call.args.reduce((a, b) => Number(a) + Number(context.evaluate(b)), 0);
        }
    },

    "*": {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return call.args.reduce((a, b) => Number(a) * Number(context.evaluate(b)), 1);
        }
    },

    abs: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'abs'`);
            }
            return Math.abs(value);
        }
    },

    acos: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'acos'`);
            }
            return Math.acos(value);
        }
    },

    asin: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'asin'`);
            }
            return Math.asin(value);
        }
    },

    atan: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'atan'`);
            }
            return Math.atan(value);
        }
    },

    ceil: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'ceil'`);
            }
            return Math.ceil(value);
        }
    },

    cos: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'cos'`);
            }
            return Math.cos(value);
        }
    },

    e: {
        call: () => {
            return Math.E;
        }
    },

    floor: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'floor'`);
            }
            return Math.floor(value);
        }
    },

    ln: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'ln'`);
            }
            return Math.log(value);
        }
    },

    ln2: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'ln2'`);
            }
            return Math.log2(value);
        }
    },

    log10: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'log10'`);
            }
            return Math.log10(value);
        }
    },

    max: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return Math.max(...call.args.map(v => Number(context.evaluate(v))));
        }
    },

    min: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            return Math.min(...call.args.map(v => Number(context.evaluate(v))));
        }
    },

    /**
     * Clamp numeric value to given range, inclusive.
     *
     * Synopsis:
     * ```
     * ["clamp", v: number, min: number, max: number]`
     * ```
     */
    clamp: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const v = context.evaluate(call.args[0]);
            const min = context.evaluate(call.args[1]);
            const max = context.evaluate(call.args[2]);

            if (typeof v !== "number" || typeof min !== "number" || typeof max !== "number") {
                throw new Error(`invalid operands '${v}', ${min}, ${max} for operator 'clamp'`);
            }
            return THREE.MathUtils.clamp(v, min, max);
        }
    },

    pi: {
        call: () => {
            return Math.PI;
        }
    },

    round: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'round'`);
            }
            return Math.round(value);
        }
    },

    sin: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'sin'`);
            }
            return Math.sin(value);
        }
    },

    sqrt: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'sqrt'`);
            }
            return Math.sqrt(value);
        }
    },

    tan: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const value = context.evaluate(call.args[0]);
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'tan'`);
            }
            return Math.tan(value);
        }
    }
};

export const MathOperators: OperatorDescriptorMap = operators;
export type MathOperatorNames = keyof typeof operators;
