/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
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
 * @param condition - Condition to match, if false, throws an Error(message)
 * @param message - Optional message, defaults to "ASSERTION failed"
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
