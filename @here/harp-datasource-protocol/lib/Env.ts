/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The type representing the value of a property.
 */
export type Value = null | boolean | number | string | object;

/**
 * An interface defining a collection of named properties.
 *
 * @example
 * ```typescript
 * const properties: ValueMap = {
 *    $id: 123,
 *    color: "rgba(255, 0, 0, 1)"
 * }
 * ```
 */
export interface ValueMap {
    [name: string]: Value;
}

/**
 * A class used to lookup properties by name.
 *
 * @remarks
 * Concrete implementation of `Env` like {@link MapEnv} are used
 * to resolve the property names used in {@link Expr | style expressions}.
 *
 * @example
 * ```typescript
 * const env = new MapEnv({
 *     kind: "landuse",
 * });
 *
 * const expr = Expr.fromJson(["get", "kind"]);
 *
 * const value = expr.evaluate(env);
 *
 * console.log(`kind is '${value}`);
 * ```
 */
export class Env {
    /**
     * Returns `true` if the given object is an instance of {@link Env}.
     *
     * @param object - The object to test.
     */
    static isEnv(object: any): object is Env {
        return object instanceof Env;
    }

    /**
     * Returns property in {@link Env} by name.
     *
     * @param name - Name of property.
     */
    lookup(name: string): Value | undefined {
        return undefined;
    }

    /**
     * Return an object containing all properties of this environment. (Here: empty object).
     */
    unmap(): ValueMap {
        return {};
    }
}

/**
 * `MapEnv` is a concrete implementation of {@link Env} that
 * creates a lookup environment from a set of properties.
 *
 * @example
 * ```typescript
 * const baseEnv = new MapEnv({
 *     $zoom: 14,
 * });
 *
 * // extends baseEnv with a the new binding (kind, "landuse").
 * const env = new MapEnv({ kind: "landuse" }, baseEnv);
 *
 * const zoom = env.lookup("$zoom"); // zoom is 14
 * const kind = env.lookup("kind"); // kind is is "landuse"
 *
 * const expr = Expr.fromJson(["get", "kind"]);
 * const value = expr.evaluate(env); // value is "landuse"
 * ```
 */
export class MapEnv extends Env {
    constructor(readonly entries: ValueMap, private readonly parent?: Env) {
        super();
    }

    /**
     * Returns property in {@link Env} by name.
     *
     * @param name - Name of property.
     * @override
     */
    lookup(name: string): Value | undefined {
        if (this.entries.hasOwnProperty(name)) {
            const value = this.entries[name];
            if (value !== undefined) {
                return value;
            }
        }
        return this.parent ? this.parent.lookup(name) : undefined;
    }

    /**
     * Return an object containing all properties of this environment, takes care of the parent
     * object.
     * @override
     */
    unmap(): ValueMap {
        const obj: any = this.parent ? this.parent.unmap() : {};
        for (const key in this.entries) {
            if (this.entries.hasOwnProperty(key)) {
                obj[key] = this.entries[key];
            }
        }
        return obj;
    }
}
