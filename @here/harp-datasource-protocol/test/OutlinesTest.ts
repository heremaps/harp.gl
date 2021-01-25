/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { addPolygonEdges } from "../lib/Outliner";

describe("Outlines", function () {
    const indices: number[] = [];
    const outlineIndicesA: number[] = [];
    const outlineIndicesB: number[] = [];
    const contour = [-0.5, -0.5, 0.0, 0.5, -0.5, 0.0, 0.5, 0.5, 0.0, -0.5, 0.5, 0.0];
    beforeEach(() => {
        indices.length = 0;
        outlineIndicesA.length = 0;
        outlineIndicesB.length = 0;
    });

    it("Outside Tile", function () {
        addPolygonEdges(outlineIndicesA, 0, 3, contour, [false, false, false, false], true);
        addPolygonEdges(outlineIndicesB, 0, 3, contour, [false, false, false, false]);
        assert.equal(outlineIndicesA.length, 0);
        assert.equal(outlineIndicesB.length, 0);
    });

    it("Crossing Tile", function () {
        addPolygonEdges(outlineIndicesA, 0, 3, contour, [false, true, false, true], true);
        addPolygonEdges(outlineIndicesB, 0, 3, contour, [false, true, false, true]);
        assert.deepEqual(outlineIndicesA, [3, 5, 7, 1]);
        assert.deepEqual(outlineIndicesB, [1, 2, 3, 0]);
    });

    it("Inside Tile", function () {
        addPolygonEdges(outlineIndicesA, 0, 3, contour, [true, true, true, true], true);
        addPolygonEdges(outlineIndicesB, 0, 3, contour, [true, true, true, true]);
        assert.deepEqual(outlineIndicesA, [1, 3, 0, 1, 3, 5, 2, 3, 5, 7, 4, 5, 7, 1, 6, 7]);
        assert.deepEqual(outlineIndicesB, [0, 1, 1, 2, 2, 3, 3, 0]);
    });

    it("Extruded - Footprints", function () {
        addPolygonEdges(outlineIndicesA, 0, 3, contour, [true, true, true, true], true, true);
        assert.deepEqual(outlineIndicesA, [
            0,
            2,
            1,
            3,
            0,
            1,
            2,
            4,
            3,
            5,
            2,
            3,
            4,
            6,
            5,
            7,
            4,
            5,
            6,
            0,
            7,
            1,
            6,
            7
        ]);
    });

    it("Extruded - Slope", function () {
        addPolygonEdges(outlineIndicesA, 0, 3, contour, [true, true, true, true], true, false, 0.0);
        assert.deepEqual(outlineIndicesA, [1, 3, 0, 1, 3, 5, 2, 3, 5, 7, 4, 5, 7, 1, 6, 7]);
    });
});
