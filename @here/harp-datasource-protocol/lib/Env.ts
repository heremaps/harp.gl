/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @hidden
 */
export type Value = null | boolean | number | string | object;

/**
 * @hidden
 */
export interface ValueMap {
    [name: string]: Value;
}

/**
 * @hidden
 */
export class Env {
    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(_name: string): Value | undefined {
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
 * Adds access to map specific environment properties.
 */
export class MapEnv extends Env {
    constructor(readonly entries: ValueMap, private readonly parent?: Env) {
        super();
    }
    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
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
