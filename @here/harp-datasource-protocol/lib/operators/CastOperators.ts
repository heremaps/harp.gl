/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export const CastOperators = {
    "to-boolean": {
        call: (actuals: unknown[]) => Boolean(actuals[0])
    },

    "to-number": {
        call: (actuals: unknown[]) => Number(actuals[0])
    },

    "to-string": {
        call: (actuals: unknown[]) => String(actuals[0])
    }
};

export type CastOperatorNames = keyof typeof CastOperators;
