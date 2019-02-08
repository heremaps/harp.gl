/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simplified definition of a JSON-like object.
 */
export interface JSONLikeObject {
    [key: string]: any;
}

/**
 * Returns a depthless object from a JSON-like object, via the method `flatten`. Traditional vanilla
 * JS writing is used to create the new properties representing the previously nested values: dots
 * (".") for objects and brackets ("[]") with their indices for arrays.
 *
 * @example
 * ```typescript
 * const jsonLike = {
 *     "number": 2,
 *     "string": "",
 *     "boolean": false,
 *     "null": null,
 *     "nestedObject": {
 *         "foo": null,
 *         "array": [57]
 *     },
 *     "array": [33, { bar: "foo" }]
 * };
 *
 * const flattenedJsonLike = Flattener.flatten(jsonLike, "properties");
 *
 * // `jsonLike` is not modified. `flattenedJsonLike` is as follows:
 * {
 *     "properties.number": 2,
 *     "properties.string": "",
 *     "properties.boolean": false,
 *     "properties.null": null,
 *     "properties.nestedObject.foo": null,
 *     "properties.nestedObject.array[0]": 57,
 *     "properties.array[0]": 33,
 *     "properties.array[1].bar": "foo"
 * }
 * ```
 */
export class Flattener {
    /**
     * The entry point of the `Flattener`.
     *
     * @param model The original object whose fields will be flatten in another one.
     * @param prefix An optional prefix for the flattened properties.
     */
    static flatten(model: JSONLikeObject, prefix: string = ""): JSONLikeObject {
        const result = {};
        this.processObject(model, result, prefix);
        return result;
    }

    /**
     * Loops through the properties of an object and appends the string `".property"` to the path,
     * then further calls `Flattener.processValue` on each value of this object.
     *
     * @param object The object to flatten.
     * @param target The empty object created in `this.m_result`, and being filled.
     * @param path The path to extend with this object nesting level.
     */
    private static processObject(object: JSONLikeObject, target: JSONLikeObject, path: string) {
        for (const property in object) {
            if (object[property] !== undefined) {
                const prefix = path.length ? path + "." + property : property;
                this.processValue(object[property], target, prefix);
            }
        }
    }

    /**
     * Loops through the array and appends the string `"[index]"` to the path, then further calls
     * `Flattener.processValue` on each element of the array.
     *
     * @param array The array to flatten.
     * @param target The empty object created in `this.m_result`, and being filled.
     * @param path The path to extend with this array nesting level.
     */
    private static processArray(array: any[], target: JSONLikeObject, path: string) {
        for (let index = 0; index < array.length; index++) {
            const prefix = `${path}[${index}]`;
            this.processValue(array[index], target, prefix);
        }
    }

    /**
     * Writes the source value, or in case it is an array or an object, dispatches the flattening to
     * the relevant handlers.
     *
     * @param value The value to flatten. Can be any value supported by the JSON format.
     * @param target The empty object created in `this.m_result`, and being filled.
     * @param key The name of the property to write, prefixed with the upper nesting levels.
     */
    private static processValue(value: any, target: JSONLikeObject, key: string) {
        if (["number", "string", "boolean"].indexOf(typeof value) > -1 || value === null) {
            target[key] = value;
        } else if (Array.isArray(value)) {
            this.processArray(value, target, key);
        } else {
            this.processObject(value, target, key);
        }
    }
}
