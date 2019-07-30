/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperatorDescriptorMap } from "../ExprEvaluator";

const operators = {
    length: {
        call: (actuals: unknown[]) => {
            const value = actuals[0];
            if (Array.isArray(value) || typeof value === "string") {
                return value.length;
            }
            throw new Error(`invalid operand '${value}' for operator 'length'`);
        }
    }
};

export const MiscOperators: OperatorDescriptorMap = operators;
export type MiscOperatorNames = keyof typeof operators;
