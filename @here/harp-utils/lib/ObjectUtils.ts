/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deep clone of object.
 *
 * Like `JSON.parse(JSON.stringify(obj))`, but supports basic javascript types (string, number,
 * object), `Date` and `RegExp`s and cycles.
 *
 * Throws error if enounters object with `prototype` assuming that in general class instances
 * cannot be reliably cloned by generic algorithm.
 */
export function cloneDeep<T>(obj: T): T {
    const cache: Map<object, object> = new Map();
    function cloneInternal(src: any): any {
        if (src === null) {
            return null;
        } else if (typeof src === "object") {
            const cached = cache.get(src);
            if (cached !== undefined) {
                return cached;
            }

            if (Array.isArray(src)) {
                const result: any[] = [];
                cache.set(src, result);
                result.length = src.length;
                for (let i = 0; i < result.length; ++i) {
                    result[i] = cloneInternal(src[i]);
                }
                return result;
            } else if (src instanceof Date) {
                const result = new Date(src.getTime());
                cache.set(src, result);
                return result;
            } else if (src instanceof RegExp) {
                const result = new RegExp(src.source, src.flags);
                cache.set(src, result);
                return result;
            } else if (src.constructor !== Object) {
                throw new Error("cloneDeep doesn't support objects with custom prototypes");
            } else {
                const result: typeof src = {};
                cache.set(src, result);
                for (const key in src) {
                    if (src.hasOwnProperty(key)) {
                        result[key] = cloneInternal(src[key]);
                    }
                }
                return result;
            }
        } else {
            // string, number, boolean, undefined and functions are returned as is
            return src;
        }
    }

    const r = cloneInternal(obj);
    cache.clear();
    return r;
}

/**
 * Pick `props` from `object.
 *
 * Runtime version of `Pick<T,K>`.
 */
export function pick<T extends object, K extends keyof T>(object: T, props: K[]): Pick<T, K> {
    const result: any = {};
    for (const propName of props) {
        if (object.hasOwnProperty(propName)) {
            result[propName] = object[propName];
        }
    }
    return result;
}
