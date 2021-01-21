/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Get first defined value.
 *
 * Specialized "replacement" for `a || b || c` used frequently to get value from various sources
 * (defaults, configs  constants).
 * In contrast to `||`, this function provides proper typing for usual use cases (constant as last
 * argument) and correct treatment of `null` and `undefined`.
 *
 * If last parameter is "defined" then return type is `T`, otherwise return type is `T | undefined`.
 *
 * Usage example:
 *
 *     interface Config {
 *         x?: number;
 *     }
 *     const someConfig: Config = {};
 *     const val: number | undefined = undefined;
 *     const DEFAULT = 5;
 *     const x = getOptionValue(val, someConfig.x, DEFAULT);
 *         // typeof x === 'number' because DEFAULT is defined
 *     const y = getOptionValue(val, someConfig.x);
 *         // typeof y === 'number | undefined' because someConfig.x is possibly undefined
 */
// specialized overloads with last param defined params overload
export function getOptionValue<T>(a: T): T;
export function getOptionValue<T>(a: T | undefined, b: T): T;
export function getOptionValue<T>(a: T | undefined, b: T | undefined, c: T): T;
export function getOptionValue<T>(a: T | undefined, b: T | undefined, c: T | undefined, d: T): T;
export function getOptionValue<T>(...values: Array<T | undefined>): T | undefined;

export function getOptionValue<T>(...values: Array<T | undefined>): T | undefined {
    for (const candidate of values) {
        if (candidate !== undefined && candidate !== null) {
            return candidate;
        }
    }
    return undefined;
}
