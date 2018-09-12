/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { assert } from "chai";
import { PerformanceTimer } from "../lib/PerformanceTimer";

describe("PerformanceTimer", () => {
    it("#now", () => {
        const t0 = PerformanceTimer.now();
        assert.isNumber(t0);
        assert.isAbove(t0, 0);

        setTimeout(() => {
            const t1 = PerformanceTimer.now();
            assert.isNumber(t1);
            assert.isAbove(t1, t0);
        }, 2);
    });
});
