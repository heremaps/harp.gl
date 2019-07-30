/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export const CastOperators = {
    "to-boolean": {
        call: (actuals: unknown[]) => Boolean(actuals[0])
    },

    "to-string": {
        call: (actuals: unknown[]) => String(actuals[0])
    },

    "to-number": {
        call: (actuals: unknown[]) => {
            for (const actual of actuals) {
                const value = Number(actual);
                if (!isNaN(value)) {
                    return value;
                }
            }
            throw new Error("cannot convert the value to a number");
        }
    }
};

export type CastOperatorNames = keyof typeof CastOperators;
