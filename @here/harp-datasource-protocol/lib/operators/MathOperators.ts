/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Value } from "../Expr";
import { OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    "^": {
        call: (actuals: Value[]) => {
            const a = actuals[0];
            const b = actuals[1];
            if (typeof a !== "number" || typeof b !== "number") {
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '^'`
                );
            }
            return Math.pow(a, b);
        }
    },

    "-": {
        call: (actuals: Value[]) => {
            const a = actuals[0];
            const b = actuals[1];
            if (typeof a !== "number" || typeof b !== "number") {
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '-'`
                );
            }
            return a - b;
        }
    },

    "/": {
        call: (actuals: Value[]) => {
            const a = actuals[0];
            const b = actuals[1];
            if (typeof a !== "number" || typeof b !== "number") {
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '/'`
                );
            }
            return a / b;
        }
    },

    "%": {
        call: (actuals: Value[]) => {
            const a = actuals[0];
            const b = actuals[1];
            if (typeof a !== "number" || typeof b !== "number") {
                // tslint:disable-next-line: max-line-length
                throw new Error(
                    `invalid operands '${typeof a}' and '${typeof b}' for operator '%'`
                );
            }
            return a % b;
        }
    },

    "+": {
        call: (actuals: Value[]) => actuals.reduce((a, b) => Number(a) + Number(b), 0)
    },

    "*": {
        call: (actuals: Value[]) => actuals.reduce((a, b) => Number(a) * Number(b), 1)
    },

    abs: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'abs'`);
            }
            return Math.abs(value);
        }
    },

    acos: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'acos'`);
            }
            return Math.acos(value);
        }
    },

    asin: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'asin'`);
            }
            return Math.asin(value);
        }
    },

    atan: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'atan'`);
            }
            return Math.atan(value);
        }
    },

    ceil: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'ceil'`);
            }
            return Math.ceil(value);
        }
    },

    cos: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
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
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'floor'`);
            }
            return Math.floor(value);
        }
    },

    ln: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'ln'`);
            }
            return Math.log(value);
        }
    },

    ln2: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'ln2'`);
            }
            return Math.log2(value);
        }
    },

    log10: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'log10'`);
            }
            return Math.log10(value);
        }
    },

    max: {
        call: (actuals: Value[]) => {
            return Math.max(...actuals.map(v => Number(v)));
        }
    },

    min: {
        call: (actuals: Value[]) => {
            return Math.min(...actuals.map(v => Number(v)));
        }
    },

    pi: {
        call: () => {
            return Math.PI;
        }
    },

    round: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'round'`);
            }
            return Math.round(value);
        }
    },

    sin: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'sin'`);
            }
            return Math.sin(value);
        }
    },

    sqrt: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'sqrt'`);
            }
            return Math.sqrt(value);
        }
    },

    tan: {
        call: (actuals: Value[]) => {
            const value = actuals[0];
            if (typeof value !== "number") {
                throw new Error(`invalid operand '${value}' for operator 'tan'`);
            }
            return Math.tan(value);
        }
    }
};

export const MathOperators: OperatorDescriptorMap = operators;
export type MathOperatorNames = keyof typeof operators;
