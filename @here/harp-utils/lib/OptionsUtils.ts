/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
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

/**
 * Merge options into existing parameters object.
 *
 * Convenience helper with _similar_ semantics as:
 *
 *     const finalParams1 = { ...defaults, ... options };
 *     const finalParams2 = Object.assign({}, defaults, options);
 *
 * This function doesn't copy _extra_ properties of `options` that doesn't exist in `defaults`.
 * `defaults` is used as _parameters_ template.
 *
 * This doc uses following notion of `option` and `parameter` terms:
 * * `parameter` is a variable, or 'almost constant' of procedure/function/algorith/object
 *    * `parameter` usually have sensible and usually used default
 *    * `parameter` is always defined (no `undefined`, `null` or `?` in type)
 *    * `parameter` can be overriden by specyfying `option` with same name
 * * `option` means value that may be passed optionally, overrides `parameter` value with same name
 *
 * Usage:
 *
 *     interface FooParams {
 *         useTextures: boolean;
 *         opacity: number;
 *     }
 *
 *     const FOO_DEFAULTS: FooParams = {
 *         useTextures: true,
 *         opacity: 0.8
 *     };
 *
 *     type FooOptions = Partial<FooParams>;
 *
 *     function doSomething(options: FooOptions) {
 *         const params = mergeWithOptions(FOO_DEFAULTS, options);
 *             // typeof params === FooParams
 *             // params.opacity = 0.5
 *             // params.useTextures = true
 *             // params.someOtherOptionFromOtherApi is not defined
 *     }
 *     const opt = {opacity: 0.5, someOtherOptionFromOtherApi: 'aaa'};
 *     doSomething(opt);
 *
 * Rationale:
 *   * both `Object.assign` and spread operator copy extra options
 *   * `Object.assign` & `spread operator` may copy `undefined` and `null`s if they really exist
 *     in options object
 *
 * @param parameters - parmeters template object holding all expected parameters
 * @param options - options object
 * @returns new object with `parameters` overriden by values from `options`
 */
export function mergeWithOptions<T extends object>(parameters: T, options?: Partial<T>): T {
    // NOTE: `as object` needed due to TypeScript bug:
    //       https://github.com/Microsoft/TypeScript/issues/14409
    // tslint:disable-next-line:no-object-literal-type-assertion
    const result = { ...(parameters as object) } as T;
    if (options === undefined || options === null) {
        return result;
    }
    for (const prop in parameters) {
        if (parameters.hasOwnProperty(prop)) {
            const optionValue = options[prop];
            if (optionValue !== undefined && optionValue !== null) {
                result[prop] = optionValue as any;
            }
        }
    }
    return result;
}
