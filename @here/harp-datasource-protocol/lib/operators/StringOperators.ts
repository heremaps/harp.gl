/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    concat: {
        call: (actuals: unknown[]) => {
            return "".concat(...actuals.map(a => String(a)));
        }
    },

    downcase: {
        call: (actuals: unknown[]) => {
            return String(actuals[0]).toLocaleLowerCase();
        }
    },

    upcase: {
        call: (actuals: unknown[]) => {
            return String(actuals[0]).toLocaleUpperCase();
        }
    },

    "~=": {
        call: (actuals: unknown[]) => {
            const left = actuals[0];
            const right = actuals[1];
            if (typeof left === "string" && typeof right === "string") {
                return left.indexOf(right) !== -1;
            }
            return false;
        }
    },

    "^=": {
        call: (actuals: unknown[]) => {
            const left = actuals[0];
            const right = actuals[1];
            if (typeof left === "string" && typeof right === "string") {
                return left.startsWith(right);
            }
            return false;
        }
    },

    "$=": {
        call: (actuals: unknown[]) => {
            const left = actuals[0];
            const right = actuals[1];
            if (typeof left === "string" && typeof right === "string") {
                return left.endsWith(right);
            }
            return false;
        }
    }
};

export const StringOperators: OperatorDescriptorMap = operators;
export type StringOperatorNames = keyof typeof operators;
