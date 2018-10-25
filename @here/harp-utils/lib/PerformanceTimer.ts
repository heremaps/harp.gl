/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* tslint:disable:max-line-length */
/**
 * See:
 * https://developers.google.com/web/updates/2012/08/When-milliseconds-are-not-enough-performance-now
 */
/* tslint:ensable:max-line-length */

export class PerformanceTimer {
    /**
     * Returns timestamp in milliseconds since page load.
     *
     * If the [[DOMHighResTimeStamp]] is supported, the resolution is up to 5 microseconds,
     * otherwise it is in milliseconds. Timespans are computed by taking the difference between two
     * samples.
     *
     * Example:
     * ```typescript
     * const now = PerformanceTimer.now();
     * // call some expensive function for which you want to check the duration.
     * const end = PerformanceTimer.now();
     * const elapsedTime = end - now;
     * ```
     */
    static now(): number {
        return PerformanceTimer.nowFunc();
    }

    // tslint:disable-next-line:no-unused-variable
    private static readonly instance = new PerformanceTimer();

    private static readonly nowFunc: () => number = PerformanceTimer.getNowFunc();

    private static getNowFunc() {
        if (typeof performance !== "undefined" && typeof performance.now !== "undefined") {
            return () => performance.now();
        }

        // fall back to Date.getTime()
        return () => {
            return new Date().getTime();
        };
    }
}
