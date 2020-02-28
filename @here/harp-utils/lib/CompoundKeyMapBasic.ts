/*
 * Copyright (C) 2020 HERE Europe B.V.
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
 *
 * API modeled after standard Javascript `Map`.
 */
export class CompoundKeyMapBasic<T, K extends any[] = any[]> {
    private entries: Array<[T, ...any[]]> = [];

    /**
     * Get the number of elements in this container.
     */
    size(): number {
        return this.entries.length;
    }

    /**
     * Search for value matching `key`.
     */
    get(key: K): T | undefined {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            return this.entries[entryIndex][0];
        } else {
            return undefined;
        }
    }

    /**
     * Get current value under `key` or create new one using `factory` add it to container.
     */
    getOrCreate(key: K, factory: () => T): T {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            return this.entries[entryIndex][0];
        }
        const newItem = factory();
        this.entries.push([newItem, ...key]);
        return newItem;
    }

    /**
     * Set for `value` under `key`.
     */
    set(key: K, newItem: T): void {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            this.entries[entryIndex][0] = newItem;
        } else {
            this.entries.push([newItem, ...key]);
        }
    }

    /**
     * Remove entry identified by particular `key`.
     */
    delete(key: K): void {
        const entryIndex = this.findEntryIndex(key);
        if (entryIndex !== undefined) {
            this.entries.splice(entryIndex, 1);
        }
    }

    /**
     * Clear map.
     */
    clear() {
        this.entries.length = 0;
    }

    /**
     * Iterate over all values of map.
     */
    forEach(iteratee: (v: T) => void) {
        for (const entry of this.entries) {
            iteratee(entry[0]);
        }
    }

    private findEntryIndex(key: K) {
        for (let entryIndex = 0; entryIndex < this.entries.length; entryIndex++) {
            const entry = this.entries[entryIndex];

            let entryMatches = entry.length - 1 === key.length;
            for (let i = 0; entryMatches && i < key.length; i++) {
                if (entry[i + 1] !== key[i]) {
                    entryMatches = false;
                }
            }
            if (entryMatches) {
                return entryIndex;
            }
        }
        return undefined;
    }
}
