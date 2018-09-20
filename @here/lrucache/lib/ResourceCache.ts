/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { CachedResource } from "@here/utils";
import { LRUCache } from "./LRUCache";

/**
 * @deprecated
 *
 * Use a LRUCache with a custom cost function. This class will be removed.
 */
export class ResourceCache<Key, Value extends CachedResource> extends LRUCache<Key, Value> {
    private m_memoryLimit: number;

    /**
     * Creates a new instance of `ResourceCache`.
     *
     * @param cacheCapacity The maximum number of entries to store in the cache.
     * @param memoryLimit The maximum number of memory to store in the cache.
     */
    constructor(cacheCapacity: number, memoryLimit: number) {
        super(cacheCapacity);
        this.m_memoryLimit = memoryLimit;
    }

    /**
     * The maximum number of memory allocated by objects in cache.
     *
     * @returns The size of the cache in bytes.
     */
    get maximumMemoryAllocated(): number {
        return this.m_memoryLimit;
    }

    /**
     * Resets the capacity of this cache. If `newCapacity` is smaller than the current cache size,
     * all items will be evicted until the cache shrinks to `newCapacity`.
     *
     * @param newMaximumMemoryAllocated The new capacity of this cache.
     */
    setMaximumMemoryAllocated(newMaximumMemoryAllocated: number): void {
        this.m_memoryLimit = newMaximumMemoryAllocated;
        this.evict();
    }

    /**
     * Inserts or updates a key/value pair in the cache.
     *
     * If the key already existed in the cache, it will be updated and promoted to the most recently
     * used item.
     *
     * If the key didn't exist in the cache, it will be inserted as most recently used item. An
     * eviction of the least recently used item takes place if the cache exceeded its capacity.
     *
     * @param key The key for the key-value pair to insert or update.
     * @param value The value for the key-value pair to insert or update.
     */
    set(key: Key, value: Value) {
        super.set(key, value);
        this.evict();
    }

    protected evict() {
        let allocatedMemory = this.calculateMemoryUsage();

        while (this.map.size > this.capacity || allocatedMemory > this.m_memoryLimit) {
            const numBytesUsed = this.evictOldest().value.memoryUsage;
            if (numBytesUsed !== undefined) {
                allocatedMemory = allocatedMemory - numBytesUsed;
            }
        }
    }

    private calculateMemoryUsage(): number {
        let allocatedMemory = 0;
        this.map.forEach(obj => {
            allocatedMemory += obj.value.memoryUsage;
        });
        return allocatedMemory;
    }
}
