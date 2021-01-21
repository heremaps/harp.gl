/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * See:
 * https://developers.google.com/web/updates/2012/08/When-milliseconds-are-not-enough-performance-now
 */

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
