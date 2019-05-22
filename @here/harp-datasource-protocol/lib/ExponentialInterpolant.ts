/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Interpolant } from "three";

export class ExponentialInterpolant extends Interpolant {
    /**
     * Exponent value. Defaults to `2.0`.
     */
    exponent: number = 2.0;

    // Note: We need to disable linting here as tslint thinks this function is never used, though it
    // indeed is called by ``Interpolant.evaluate(level)``.
    // tslint:disable-next-line
    private interpolate_(i1: number, t0: number, t: number, t1: number) {
        const result = this.resultBuffer;
        // TODO: Remove when Interpolant types are fixed.
        const values = (this as any).sampleValues;
        const stride = this.valueSize;
        const offset1 = i1 * stride;
        const offset0 = offset1 - stride;
        const weight1 = Math.pow((t - t0) / (t1 - t0), this.exponent);
        const weight0 = 1 - weight1;

        for (let i = 0; i !== stride; ++i) {
            result[i] = values[offset0 + i] * weight0 + values[offset1 + i] * weight1;
        }

        return result;
    }
}
