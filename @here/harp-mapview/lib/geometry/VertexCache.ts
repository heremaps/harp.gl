/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";

// Offsets for the fields stored in cache for each vertex.
enum Field {
    VertexId = 0,
    OlderIdx, // Index in cache of the immediately older vertex.
    NewerIdx, // Index in cache of the immediately newer vertex.
    X,
    Y,
    Z,
    Count
}

const Invalid: number = -1;

/**
 * Compact vertex LRU Cache for on the fly temporary mesh transformations.
 * @internal
 */
export class VertexCache {
    private m_cache: number[] = []; // Stores all fields for every cached vertex (see Field).
    private m_vertexCount: number = 0;
    private m_oldestIdx: number = 0;
    private m_newestIdx: number = 0;

    /**
     * Creates a new cache with the specified maximum size.
     * @param maxVertexCount - The maximum number of vertices the cache will store.
     */
    constructor(readonly maxVertexCount: number) {
        this.m_cache.length = this.maxVertexCount * Field.Count;
        this.clear();
    }

    /**
     * Clears the vertex cache.
     */
    clear() {
        this.m_cache.fill(Invalid);
        this.m_vertexCount = 0;
    }

    /**
     * Gets a vertex from cache.
     * @param vertexId - The id of the vertex to get.
     * @param vertex - The vertex coordinates will be set here if found.
     * @returns whether the vertex was found on cache.
     */
    get(vertexId: number, vertex: Vector3Like): boolean {
        const vertexIdx = this.find(vertexId);
        if (vertexIdx === undefined) {
            return false;
        }
        this.promoteEntry(vertexIdx);
        this.getVertex(vertexIdx, vertex);
        return true;
    }

    /**
     * Sets a vertex in cache. It's assumed there's no vertex with the same id already in cache.
     * @param vertexId - The vertex id.
     * @param vertex - The vertex coordinates.
     */
    set(vertexId: number, vertex: Vector3Like) {
        let vertexIdx = Invalid;
        if (this.m_vertexCount < this.maxVertexCount) {
            vertexIdx = this.m_vertexCount * Field.Count;
            this.m_vertexCount++;
        } else {
            vertexIdx = this.m_oldestIdx;
        }
        if (this.m_vertexCount === 1) {
            this.m_oldestIdx = this.m_newestIdx = vertexIdx;
        } else {
            this.promoteEntry(vertexIdx);
        }
        this.setVertex(vertexIdx, vertexId, vertex);
    }

    private find(vertexId: number): number | undefined {
        const size = this.m_cache.length;
        for (let i = 0; i < size; i += Field.Count) {
            if (this.m_cache[i] === vertexId) {
                return i;
            }
        }
        return undefined;
    }

    private promoteEntry(vertexIdx: number): void {
        if (vertexIdx === this.m_newestIdx) {
            return;
        } // already newest, nothing to do
        // re-link newer and older items
        const newerIdx = this.getNewerIdx(vertexIdx);
        const olderIdx = this.getOlderIdx(vertexIdx);
        if (newerIdx !== Invalid) {
            assert(this.getOlderIdx(newerIdx) === vertexIdx);
            this.setOlderIdx(newerIdx, olderIdx);
        }
        if (olderIdx !== Invalid) {
            assert(this.getNewerIdx(olderIdx) === vertexIdx);
            this.setNewerIdx(olderIdx, newerIdx);
        }
        if (vertexIdx === this.m_oldestIdx) {
            this.m_oldestIdx = newerIdx;
        }
        // re-link ourselves
        this.setNewerIdx(vertexIdx, Invalid);
        this.setOlderIdx(vertexIdx, this.m_newestIdx);
        // finally, set ourselves as the newest entry
        assert(this.m_newestIdx !== Invalid);
        assert(this.getNewerIdx(this.m_newestIdx) === Invalid);
        this.setNewerIdx(this.m_newestIdx, vertexIdx);
        this.m_newestIdx = vertexIdx;
    }

    private getOlderIdx(vertexIdx: number): number {
        return this.m_cache[vertexIdx + Field.OlderIdx];
    }

    private setOlderIdx(vertexIdx: number, olderIdx: number): void {
        this.m_cache[vertexIdx + Field.OlderIdx] = olderIdx;
    }

    private getNewerIdx(vertexIdx: number): number {
        return this.m_cache[vertexIdx + Field.NewerIdx];
    }

    private setNewerIdx(vertexIdx: number, newerIdx: number): void {
        this.m_cache[vertexIdx + Field.NewerIdx] = newerIdx;
    }

    private getVertex(vertexIdx: number, vertex: Vector3Like): void {
        vertex.x = this.m_cache[vertexIdx + Field.X];
        vertex.y = this.m_cache[vertexIdx + Field.Y];
        vertex.z = this.m_cache[vertexIdx + Field.Z];
    }

    private setVertex(vertexIdx: number, vertexId: number, vertex: Vector3Like): void {
        this.m_cache[vertexIdx] = vertexId;
        this.m_cache[vertexIdx + Field.X] = vertex.x;
        this.m_cache[vertexIdx + Field.Y] = vertex.y;
        this.m_cache[vertexIdx + Field.Z] = vertex.z;
    }
}
