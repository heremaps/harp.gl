/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { clipPolygon } from "@here/harp-geometry/lib/ClipPolygon";
import { assert } from "chai";
import { Vector2 } from "three";

import { Ring } from "../lib/Ring";

const DEFAULT_EXTENTS = 4 * 1024;

describe("Ring", function () {
    describe("Empty ring", () => {
        it("Defaults of empty ring", () => {
            const ring = new Ring([]);
            assert.strictEqual(ring.area, 0);
            assert.strictEqual(ring.winding, false);
            assert.strictEqual(ring.extents, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(), []);
        });

        it("with texture coordinates", () => {
            const ring = new Ring([], []);
            assert.strictEqual(ring.area, 0);
            assert.strictEqual(ring.winding, false);
            assert.strictEqual(ring.extents, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(), []);
        });

        it("with texture coordinates and extents", () => {
            const extent = 16 * 1024;
            const ring = new Ring([], [], extent);
            assert.strictEqual(ring.area, 0);
            assert.strictEqual(ring.winding, false);
            assert.strictEqual(ring.extents, extent);
            assert.deepEqual(ring.toArray(), []);
        });

        it("throws exception", () => {
            assert.throws(() => {
                const _ring = new Ring([new Vector2(0, 0)], []);
            }, "the array of texture coordinates must have the same number of elements of the array of points");

            assert.throws(() => {
                const _ring = new Ring([], [new Vector2(0, 0)]);
            }, "the array of texture coordinates must have the same number of elements of the array of points");
        });
    });

    describe("Full quad outer ring", () => {
        const points: Vector2[] = [
            new Vector2(0, 0),
            new Vector2(100, 0),
            new Vector2(100, 100),
            new Vector2(0, 100),
            new Vector2(0, 0)
        ];

        const texCoords: Vector2[] = [
            new Vector2(0, 0),
            new Vector2(1, 0),
            new Vector2(1, 1),
            new Vector2(0, 1),
            new Vector2(0, 0)
        ];

        it("no texture coordinates", () => {
            const ring = new Ring(points, undefined, DEFAULT_EXTENTS);
            assert.strictEqual(ring.area, 100 * 100);
            assert.strictEqual(ring.winding, false);
            assert.strictEqual(ring.extents, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(), [0, 0, 100, 0, 100, 100, 0, 100, 0, 0]);
        });

        it("with texture coordinates", () => {
            const ring = new Ring(points, texCoords, DEFAULT_EXTENTS);
            assert.strictEqual(ring.area, 100 * 100);
            assert.strictEqual(ring.winding, false);
            assert.strictEqual(ring.extents, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(), [
                0,
                0,
                0,
                0,
                100,
                0,
                1,
                0,
                100,
                100,
                1,
                1,
                0,
                100,
                0,
                1,
                0,
                0,
                0,
                0
            ]);
        });
    });

    describe("Full quad inner ring", () => {
        const points: Vector2[] = [
            new Vector2(0, 0),
            new Vector2(0, 100),
            new Vector2(100, 100),
            new Vector2(100, 0),
            new Vector2(0, 0)
        ];

        const texCoords: Vector2[] = [
            new Vector2(0, 0),
            new Vector2(0, 1),
            new Vector2(1, 1),
            new Vector2(1, 0),
            new Vector2(0, 0)
        ];

        it("without texture coordinates", () => {
            const ring = new Ring(points, undefined, DEFAULT_EXTENTS);
            assert.strictEqual(ring.area, -(100 * 100));
            assert.strictEqual(ring.winding, true);
            assert.strictEqual(ring.extents, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(), [0, 0, 0, 100, 100, 100, 100, 0, 0, 0]);
        });

        it("with texture coordinates", () => {
            const ring = new Ring(points, texCoords, DEFAULT_EXTENTS);
            assert.strictEqual(ring.area, -(100 * 100));
            assert.strictEqual(ring.winding, true);
            assert.strictEqual(ring.extents, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(), [
                0,
                0,
                0,
                0,
                0,
                100,
                0,
                1,
                100,
                100,
                1,
                1,
                100,
                0,
                1,
                0,
                0,
                0,
                0,
                0
            ]);
        });

        it("flatten to array at a specific offset", () => {
            const ring = new Ring(points, undefined, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray([123, 321], 2), [
                123,
                321,
                0,
                0,
                0,
                100,
                100,
                100,
                100,
                0,
                0,
                0
            ]);
        });

        it("flatten to array at a specific offset", () => {
            const ring = new Ring(points, texCoords, DEFAULT_EXTENTS);
            assert.deepEqual(ring.toArray(undefined, 6), [
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                0,
                0,
                0,
                0,
                0,
                100,
                0,
                1,
                100,
                100,
                1,
                1,
                100,
                0,
                1,
                0,
                0,
                0,
                0,
                0
            ]);
        });

        it("outlines", () => {
            const ring = new Ring(points, texCoords);
            assert.strictEqual(ring.isProperEdge(0), false);
            assert.strictEqual(ring.isProperEdge(1), true);
            assert.strictEqual(ring.isProperEdge(2), true);
            assert.strictEqual(ring.isProperEdge(3), false);
            assert.strictEqual(ring.isProperEdge(4), false);
        });
    });

    describe("Concave polygon resulting into 2 parts after clipping", () => {
        const polygon: Vector2[] = [
            new Vector2(-100, 0),
            new Vector2(4096, 0),
            new Vector2(-50, 2048),
            new Vector2(4096, 4096),
            new Vector2(-100, 4096)
        ];

        const clippedPolygon = clipPolygon(polygon, DEFAULT_EXTENTS);

        it("edge outlines", () => {
            const ring = new Ring(clippedPolygon, undefined, DEFAULT_EXTENTS);
            assert.strictEqual(ring.winding, false);
            const outlines = ring.points.map((_, i) => ring.isProperEdge(i));

            assert.deepEqual(
                ring.toArray().map(x => x | 0),
                [0, 0, 4096, 0, 0, 2023, 0, 2073, 4096, 4096, 0, 4096]
            );

            assert.deepEqual(outlines, [false, true, false, true, false, false]);
        });
    });
});
