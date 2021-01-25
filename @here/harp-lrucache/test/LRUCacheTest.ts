/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";

import { Entry, LRUCache } from "../lib/LRUCache";

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

describe("LRUCache", function () {
    it("set", function () {
        const cache = new LRUCache(3);
        cache.set(1, 1);
        cache.set(2, 2);
        cache.set(3, 3);

        assert.strictEqual(cache.get(1), 1);
        assert.strictEqual(cache.get(2), 2);
        assert.strictEqual(cache.get(3), 3);
    });

    it("get", function () {
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

    it("internalIntegrity", function () {
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

    it("overflow", function () {
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

    it("clear", function () {
        const cache = new LRUCache(3);
        cache.set(1, 1);
        cache.set(2, 2);
        cache.clear();

        assert.strictEqual(cache.get(1), undefined);
        assert.strictEqual(cache.get(2), undefined);
    });

    it("iterate", function () {
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

    it("delete", function () {
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

    it("evictionCallback", function () {
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

    it("resize", function () {
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

    it("customCost", function () {
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

    interface SizeObjType {
        size: number;
    }

    it("resize with customCost", function () {
        const cache = new TestLRUCache<number, SizeObjType>(5, n => n.size);

        const obj1 = {
            size: 1
        };
        const obj2 = {
            size: 2
        };
        const obj3 = {
            size: 3
        };
        const obj4 = {
            size: 5
        };
        const obj5 = {
            size: 10
        };
        // fill cache without overflow, make sure size is correct
        cache.set(1, obj1);
        cache.set(2, obj2);
        assert.strictEqual(cache.size, 3);
        cache.assertInternalIntegrity([2, 1]);

        // fullfil the cache
        cache.set(3, obj2);
        assert.strictEqual(cache.size, 5);
        cache.assertInternalIntegrity([3, 2, 1]);

        // Remove middle entry
        cache.delete(2);
        assert.strictEqual(cache.size, 3);
        cache.assertInternalIntegrity([3, 1]);

        // Remove first entry
        cache.delete(1);
        assert.strictEqual(cache.size, 2);
        cache.assertInternalIntegrity([3]);

        // just enough big to insert, replaces the single element cached
        cache.set(4, obj4);
        assert.isFalse(cache.has(3));
        assert.isTrue(cache.has(4));
        assert.equal(cache.size, obj4.size);
        assert.equal(cache.capacity, obj4.size);

        // to big to insert, nothing changed
        cache.set(5, obj5);
        assert.isTrue(cache.has(4));
        assert.isFalse(cache.has(5));

        // change size evaluation function
        cache.setCapacityAndMeasure(5, n => n.size / 2);

        // after change new object fits to the cache replacing last element
        cache.set(5, obj5);
        assert.isFalse(cache.has(4));
        assert.isTrue(cache.has(5));
        assert.equal(cache.size, obj5.size / 2);
        assert.equal(cache.capacity, obj5.size / 2);
        cache.assertInternalIntegrity([5]);

        // create new stack of entries, replacing the old one
        // their size sums up to 10 / 2 = 5 filling entire capacity
        cache.set(1, obj1);
        cache.assertInternalIntegrity([1]);
        cache.set(2, obj2);
        cache.assertInternalIntegrity([2, 1]);
        cache.set(3, obj3);
        cache.assertInternalIntegrity([3, 2, 1]);
        cache.set(4, obj4);
        cache.assertInternalIntegrity([4, 3, 2]);
        assert.equal(cache.size, 10 / 2);
        assert.equal(cache.capacity, 10 / 2);
    });

    it("shrinkToCapacity empty", function () {
        const cache = new TestLRUCache<number, number>(-10, n => n);

        cache.shrinkToCapacity();
        assert.strictEqual(cache.size, 0);
        assert.strictEqual(cache.newest, cache.oldest);
        assert.isNull(cache.oldest);
    });

    it("shrinkToCapacity", function () {
        const cache = new TestLRUCache<number, SizeObjType>(10, n => n.size);

        // check capacity, nothing should change
        cache.shrinkToCapacity();
        assert.strictEqual(cache.size, 0);

        const obj1 = {
            size: 1
        };
        const obj2 = {
            size: 2
        };
        // fill cache, make sure size is correct
        cache.set(1, obj1);
        cache.set(2, obj2);
        assert.strictEqual(cache.size, 3);
        cache.assertInternalIntegrity([2, 1]);

        // check capacity, nothing should change
        cache.shrinkToCapacity();
        assert.strictEqual(cache.size, 3);
        cache.assertInternalIntegrity([2, 1]);

        obj2.size = 10;
        // check capacity again, now
        cache.shrinkToCapacity();
        assert.strictEqual(cache.size, 10);
        cache.assertInternalIntegrity([2]);
    });

    class EvictedObjType {
        evicted = false;
    }
    it("evictAll", function () {
        const cache = new TestLRUCache<number, EvictedObjType>(2, n => 1);
        cache.evictionCallback = (_, o) => (o.evicted = true);

        const objects: EvictedObjType[] = [new EvictedObjType(), new EvictedObjType()];
        objects.forEach((obj, index) => {
            cache.set(index, obj);
        });
        assert.isFalse(objects[0].evicted);
        assert.isFalse(objects[1].evicted);

        // evict all objects and check their state
        cache.evictAll();
        assert.isTrue(objects[0].evicted);
        assert.isTrue(objects[1].evicted);

        // cache should be cleared
        assert.equal(cache.size, 0);
        assert.strictEqual(cache.newest, cache.oldest);
        assert.isNull(cache.oldest);
    });

    it("evictSelected", function () {
        const cache = new TestLRUCache<number, EvictedObjType>(5, n => 1);
        cache.evictionCallback = (_, o) => (o.evicted = true);

        const objects: EvictedObjType[] = [
            new EvictedObjType(),
            new EvictedObjType(),
            new EvictedObjType(),
            new EvictedObjType(),
            new EvictedObjType()
        ];

        // fill the entire cache with objects
        objects.forEach((obj, index) => {
            cache.set(index, obj);
        });

        // evict all objects with odd keys
        cache.evictSelected((_, key) => key % 2 === 0);

        // check results
        assert.isTrue(objects[0].evicted);
        assert.isTrue(objects[2].evicted);
        assert.isTrue(objects[4].evicted);

        assert.isFalse(objects[1].evicted);
        assert.isFalse(objects[3].evicted);

        // check objects state against cached values
        objects.forEach((obj, idx) => {
            assert.equal(!obj.evicted, cache.has(idx));
        });

        // restore objects state
        objects.forEach(obj => (obj.evicted = false));

        // evict objects with even keys
        cache.evictSelected((_, key) => key % 2 !== 0);

        // check results
        assert.isTrue(objects[1].evicted);
        assert.isTrue(objects[3].evicted);

        assert.isFalse(objects[0].evicted);
        assert.isFalse(objects[2].evicted);
        assert.isFalse(objects[4].evicted);

        // cache should be now cleared out and capacity left unchanged
        assert.equal(cache.size, 0);
        assert.equal(cache.capacity, 5);
        assert.strictEqual(cache.newest, cache.oldest);
        assert.isNull(cache.oldest);
    });
});
