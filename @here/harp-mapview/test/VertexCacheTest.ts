/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { expect } from "chai";

import { VertexCache } from "../lib/geometry/VertexCache";

describe("VertexCache", function () {
    it("get returns a previously set and non-evicted vertex", function () {
        const cache = new VertexCache(3);
        const expectedVertex = { x: 1, y: 4, z: -1 };
        cache.set(5, expectedVertex);
        cache.set(9, { x: 9, y: 3, z: 2 });
        cache.set(1, { x: 1, y: 1, z: 3 });

        const actualVertex = { x: 0, y: 0, z: 0 };
        const found = cache.get(5, actualVertex);
        expect(found).equals(true);
        expect(actualVertex).deep.equals(expectedVertex);
    });

    it("clear removes all vertices from cache", function () {
        const size = 5;
        const cache = new VertexCache(size);

        for (let i = 0; i < size; i++) {
            cache.set(i, { x: 1, y: 2, z: 3 });
        }
        cache.clear();
        for (let i = 0; i < size; i++) {
            const found = cache.get(i, { x: 0, y: 0, z: 0 });
            expect(found).equals(false);
        }
    });

    it("set evicts vertices in insertion order if get is never called", function () {
        const size = 5;
        const cache = new VertexCache(size);

        for (let i = 0; i < size; i++) {
            cache.set(i, { x: i * 10, y: i * 100, z: i * 1000 });
        }

        for (let i = size; i < 2 * size; i++) {
            cache.set(i, { x: i * 10, y: i * 100, z: i * 1000 });

            const found = cache.get(i - size, { x: 0, y: 0, z: 0 });
            expect(found).equals(false);
        }
    });

    it("set evicts least recently used vertex", function () {
        const size = 5;
        const cache = new VertexCache(size);

        for (let i = 0; i < size; i++) {
            cache.set(i, { x: i * 10, y: i * 100, z: i * 1000 });
        }

        for (let i = size - 1; i >= 0; i--) {
            const found = cache.get(i, { x: 0, y: 0, z: 0 });
            expect(found).equals(true);
        }

        for (let i = size; i < 2 * size; i++) {
            cache.set(i, { x: i * 10, y: i * 100, z: i * 1000 });

            const found = cache.get(2 * size - i - 1, { x: 0, y: 0, z: 0 });
            expect(found).equals(false);
        }
    });
});
