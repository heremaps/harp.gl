/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { Entry, LRUCache } from "../lib/LRUCache";

// tslint:disable:no-string-literal
// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

// helper class to access protected members of LRUCache
class TestLRUCache<Key, Value> extends LRUCache<Key, Value> {
    assertInternalIntegrity(entries: Key[]): void {
        // special case - empty cache
        if (entries.length === 0) {
            assert.strictEqual(this["m_map"].size, 0);
            assert.isNull(this["m_newest"]);
            assert.isNull(this["m_oldest"]);
            return;
        }

        // make sure the map has the correct size
        assert.strictEqual(this["m_map"].size, entries.length);

        assert.isNotNull(this["m_newest"]);
        // make sure that the first entry is the newest
        assert.strictEqual((this["m_newest"] as Entry<Key, Value>).key, entries[0]);

        // now walk our linked list
        for (let i: number = 0; i < entries.length; ++i) {
            assert.isDefined(this["m_map"].get(entries[i]));

            const entry = this["m_map"].get(entries[i]) as Entry<Key, Value>;
            assert.strictEqual(entry.key, entries[i]);

            // special case first element
            if (i === 0) {
                assert.strictEqual(entry.newer, null);
            } else {
                assert.strictEqual((entry.newer as Entry<Key, Value>).key, entries[i - 1]);
            }

            if (i === entries.length - 1) {
                assert.strictEqual(entry.older, null);
            } else {
                assert.strictEqual((entry.older as Entry<Key, Value>).key, entries[i + 1]);
            }
        }

        // make sure the last entry is the oldest
        assert.isNotNull(this["m_oldest"]);
        assert.strictEqual(
            (this["m_oldest"] as Entry<Key, Value>).key,
            entries[entries.length - 1]
        );

        let currentSize = 0;
        this.map.forEach(val => (currentSize += val.size));
        assert.strictEqual(this["m_size"], currentSize);
    }
}

describe("LRUCache", function() {
    it("set", function() {
        const cache = new LRUCache(3);
        cache.set(1, 1);
        cache.set(2, 2);
        cache.set(3, 3);

        assert.strictEqual(cache.get(1), 1);
        assert.strictEqual(cache.get(2), 2);
        assert.strictEqual(cache.get(3), 3);
    });

    it("get", function() {
        const cache = new LRUCache<number, number>(3);
        assert.strictEqual(cache.get(1), undefined);
        assert.strictEqual(cache.get(2), undefined);
        cache.set(1, 1);
        cache.set(2, 2);
        assert.strictEqual(cache.get(1), 1);
        assert.strictEqual(cache.get(2), 2);
        assert.strictEqual(cache.get(0), undefined);
        assert.strictEqual(cache.get(3), undefined);
    });

    it("internalIntegrity", function() {
        const cache = new TestLRUCache<number, number>(3);
        cache.assertInternalIntegrity([]);

        cache.set(1, 1);
        cache.assertInternalIntegrity([1]);

        cache.set(2, 2);
        cache.assertInternalIntegrity([2, 1]);

        cache.set(3, 3);
        cache.assertInternalIntegrity([3, 2, 1]);

        // reorder the LRU cache
        assert.strictEqual(cache.get(3), 3);
        cache.assertInternalIntegrity([3, 2, 1]);

        assert.strictEqual(cache.get(2), 2);
        cache.assertInternalIntegrity([2, 3, 1]);

        assert.strictEqual(cache.get(1), 1);
        cache.assertInternalIntegrity([1, 2, 3]);

        cache.set(4, 4);
        cache.assertInternalIntegrity([4, 1, 2]);
        assert.strictEqual(cache.get(3), undefined);

        cache.set(5, 5);
        cache.assertInternalIntegrity([5, 4, 1]);
        assert.strictEqual(cache.get(2), undefined);
    });

    it("overflow", function() {
        const cache = new LRUCache(3);
        cache.set(1, 1);
        cache.set(2, 2);
        cache.set(3, 3);
        cache.set(4, 4);

        assert.strictEqual(cache.get(1), undefined);
        assert.strictEqual(cache.get(2), 2);
        assert.strictEqual(cache.get(3), 3);
        assert.strictEqual(cache.get(4), 4);
    });

    it("clear", function() {
        const cache = new LRUCache(3);
        cache.set(1, 1);
        cache.set(2, 2);
        cache.clear();

        assert.strictEqual(cache.get(1), undefined);
        assert.strictEqual(cache.get(2), undefined);
    });

    it("iterate", function() {
        const cache = new LRUCache(3);

        // iterate over empty array, callback must never be called.
        let i = 1;
        cache.forEach(() => {
            assert.fail();
            ++i;
        });
        assert.strictEqual(i, 1);

        cache.set(3, 3);
        cache.set(2, 2);
        cache.set(1, 1);

        cache.forEach((key, value) => {
            assert.strictEqual(key, i);
            assert.strictEqual(value, i);
            ++i;
        });

        assert.strictEqual(i, 4);
    });

    it("delete", function() {
        const cache = new TestLRUCache(4);

        // delete the single entry (entry is both newest + oldest)
        cache.set(1, 1);
        assert.isTrue(cache.delete(1));
        assert.isUndefined(cache.get(1));
        cache.assertInternalIntegrity([]);

        // deleting it again should return false
        assert.isFalse(cache.delete(1));

        // now delete from the middle, from the end and from the front
        cache.set(4, 4);
        cache.set(3, 3);
        cache.set(2, 2);
        cache.set(1, 1);
        assert.isTrue(cache.delete(2));
        cache.assertInternalIntegrity([1, 3, 4]);

        assert.isTrue(cache.delete(4));
        cache.assertInternalIntegrity([1, 3]);

        assert.isTrue(cache.delete(1));
        cache.assertInternalIntegrity([3]);

        assert.isTrue(cache.delete(3));
        cache.assertInternalIntegrity([]);
    });

    it("evictionCallback", function() {
        let callCount: number = 0;
        let evictedKey: number;
        let evictedValue: number;

        const evictionCallback = (key: number, value: number) => {
            assert.strictEqual(key, evictedKey);
            assert.strictEqual(value, evictedValue);
            ++callCount;
        };

        const cache = new TestLRUCache<number, number>(2);
        cache.evictionCallback = evictionCallback;

        cache.set(1, 1);
        assert.strictEqual(callCount, 0);

        cache.set(2, 2);
        assert.strictEqual(callCount, 0);

        evictedKey = evictedValue = 1;
        cache.set(3, 3);
        assert.strictEqual(callCount, 1);

        evictedKey = evictedValue = 2;
        cache.set(4, 4);
        assert.strictEqual(callCount, 2);

        // update a value, no callback should be fired
        evictedKey = evictedValue = -1;
        cache.set(4, 5);
        assert.strictEqual(callCount, 2);
    });

    it("resize", function() {
        const cache = new TestLRUCache<number, number>(2);

        cache.set(1, 1);
        cache.set(2, 2);

        assert.strictEqual(cache.size, 2);
        assert.strictEqual(cache.capacity, 2);

        cache.setCapacity(1);
        assert.strictEqual(cache.capacity, 1);
        assert.strictEqual(cache.size, 1);

        assert.isFalse(cache.has(1));
        assert.isTrue(cache.has(2));

        cache.setCapacity(2);
        cache.set(1, 1);

        assert.strictEqual(cache.capacity, 2);
        assert.strictEqual(cache.size, 2);
        assert.isTrue(cache.has(1));
        assert.isTrue(cache.has(2));
    });

    it("customCost", function() {
        const cache = new TestLRUCache<number, number>(10, n => n);

        // fill cache, make sure size is correct
        cache.set(1, 1);
        cache.set(2, 2);
        assert.strictEqual(cache.size, 3);
        cache.assertInternalIntegrity([2, 1]);

        // delete all inserted items, make sure size is correct
        cache.delete(2);
        assert.strictEqual(cache.size, 1);
        cache.delete(1);
        assert.strictEqual(cache.size, 0);
        cache.assertInternalIntegrity([]);

        // overflow cache
        cache.set(10, 10);
        assert.strictEqual(cache.size, 10);
        cache.set(1, 1);
        assert.strictEqual(cache.size, 1);
        cache.assertInternalIntegrity([1]);

        // too big to insert, should do nothing
        cache.set(12, 12);
        cache.assertInternalIntegrity([1]);

        // replacing an existing item with a too big one
        cache.set(1, 12);
        assert.strictEqual(cache.get(1), undefined);

        // adding a large item should evict all older ones
        cache.clear();
        cache.set(4, 4);
        cache.set(5, 5);
        cache.set(9, 9);
        cache.assertInternalIntegrity([9]);
    });
});
