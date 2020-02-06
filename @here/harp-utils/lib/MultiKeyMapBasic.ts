/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Very basic Map<K, V> where map is compound key.
 *
 * Uses linear search over values and until it finds entry with
 * all key values `===`.
 *
 * To be used only with small number of entries.
 */
export class MultiKeyMapBasic<T, K extends any[] = any[]> {
    /**
     * Each entry contains []
     */
    entries: Array<[T, ...any[]]> = [];

    getOrCreate(key: K, factory: () => T): T {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            return this.entries[entryIndex][0];
        }
        const newItem = factory();
        this.entries.push([newItem, ...key]);
        return newItem;
    }

    set(key: K, newItem: T) {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            this.entries[entryIndex][0] = newItem;
        } else {
            this.entries.push([newItem, ...key]);
        }
    }

    get(key: K): T | undefined {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            return this.entries[entryIndex][0];
        } else {
            return undefined;
        }
    }

    remove(key: K) {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            this.entries.splice(entryIndex, 1);
        }
    }

    clear() {
        this.entries.length = 0;
    }

    forEach(iteratee: (v: T) => void) {
        for (const entry of this.entries) {
            iteratee(entry[0]);
        }
    }

    private findEntryIndex(key: K) {
        for (let entryIndex = 0; entryIndex < this.entries.length; entryIndex++) {
            const entry = this.entries[entryIndex];
            let found = true;
            for (let i = 0; i < key.length; i++) {
                if (entry[i + 1] !== key[i]) {
                    found = false;
                    continue;
                }
            }
            if (found) {
                return entryIndex;
            }
        }
        return undefined;
    }
}
