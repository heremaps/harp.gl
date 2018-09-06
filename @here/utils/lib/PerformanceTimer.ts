/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

/* tslint:disable:max-line-length */
/**
 * See:
 * https://developers.google.com/web/updates/2012/08/When-milliseconds-are-not-enough-performance-now
 */
/* tslint:ensable:max-line-length */

declare const process: any;

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
    private static instance = new PerformanceTimer();

    private static nowFunc: () => number;

    constructor() {
        if (typeof performance !== "undefined" && typeof performance.now !== "undefined") {
            /**
             * Code path for workers:
             */
            PerformanceTimer.nowFunc = () => {
                return performance.now();
            };
        } else if (typeof window !== "undefined") {
            /**
             * Code path used when run in browser.
             */
            const wAny = window as any;
            if (!!wAny && !!wAny.performance && wAny.performance.now) {
                PerformanceTimer.nowFunc = () => {
                    return window.performance.now();
                };
            } else {
                if (!!wAny && wAny.webkitNow) {
                    // Deprecated API for backwards compatibility
                    PerformanceTimer.nowFunc = () => {
                        return wAny.performance.webkitNow();
                    };
                } else {
                    // lowest resolution/quality as a fallback, mainly for some mobile browsers
                    PerformanceTimer.nowFunc = () => {
                        return new Date().getTime();
                    };
                }
            }
        } else if (typeof process !== "undefined" && typeof process.hrtime !== "undefined") {
            /**
             * Code path used when run in nodeJS.
             */
            PerformanceTimer.nowFunc = () => {
                const end = process.hrtime();
                return Math.round(end[0] * 1000 + end[1] / 1000000);
            };
        } else {
            /**
             * Default code path.
             */
            PerformanceTimer.nowFunc = () => {
                return new Date().getTime();
            };
        }
    }
}
