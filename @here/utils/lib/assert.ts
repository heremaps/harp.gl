/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

declare const process: any;

// cache value, because access to process.env.NODE_ENV is SLOW!
const isProduction = process.env.NODE_ENV === "production";

//TODO: Make assertHandler configurable

/**
 * Implementation of assert as a development help
 *
 * Note - this is deliberately a global function so that minimizers remove the
 * entire call when building for production.
 *
 * @hidden
 * @param condition Condition to match, if false, throws an Error(message)
 * @param message Optional message, defaults to "ASSERTION failed"
 */
export function assert(condition: boolean, message?: string): void {
    if (!isProduction) {
        if (!condition) {
            throw new Error(message !== undefined ? message : "ASSERTION failed");
        }
    }
}

export function assertExists<T>(element: T | undefined, message?: string): T {
    if (!isProduction) {
        if (element === undefined || element === null) {
            throw new Error(
                message !== undefined ? message : "ASSERTION failed: Element is undefined or null"
            );
        }
    }
    return element!;
}
