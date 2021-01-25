/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import { SubdivisionScheme } from "../lib/tiling/SubdivisionScheme";
import { TileKey } from "../lib/tiling/TileKey";
import { TileTreeTraverse } from "../lib/tiling/TileTreeTraverse";

/**
 * A stub scheme definition, all member functions will be overriden for each test case
 */
class TestSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(level: number): number {
        return 0;
    }

    getSubdivisionY(level: number): number {
        return 0;
    }

    getLevelDimensionX(level: number): number {
        return 0;
    }

    getLevelDimensionY(level: number): number {
        return 0;
    }
}

describe("TileTreeTraverse", function () {
    let subdivisionScheme: sinon.SinonStubbedInstance<TestSubdivisionScheme>;
    let ttt: TileTreeTraverse;

    beforeEach(function () {
        subdivisionScheme = sinon.createStubInstance(TestSubdivisionScheme);

        ttt = new TileTreeTraverse(subdivisionScheme);
    });

    function getSubTileArray(row: number, column: number, level: number): TileKey[] {
        return [...ttt.subTiles(TileKey.fromRowColumnLevel(row, column, level))];
    }

    function createTileKey({
        row,
        column,
        level
    }: {
        row: number;
        column: number;
        level: number;
    }): TileKey {
        return new TileKey(row, column, level);
    }

    it("get tiles of 1x1 subdivison", function () {
        subdivisionScheme.getSubdivisionX.returns(1);
        subdivisionScheme.getSubdivisionY.returns(1);
        subdivisionScheme.getLevelDimensionX.returns(1);
        subdivisionScheme.getLevelDimensionY.returns(1);

        const result1 = getSubTileArray(0, 0, 0);
        assert.equal(result1.length, 1);
        assert.deepInclude(result1, createTileKey({ row: 0, column: 0, level: 1 }));

        const result2 = getSubTileArray(0, 0, 1);
        assert.equal(result2.length, 1);
        assert.deepInclude(result2, createTileKey({ row: 0, column: 0, level: 2 }));

        const result3 = getSubTileArray(0, 0, 2);
        assert.equal(result3.length, 1);
        assert.deepInclude(result3, createTileKey({ row: 0, column: 0, level: 3 }));

        const result4 = getSubTileArray(0, 0, 19);
        assert.equal(result4.length, 1);
        assert.deepInclude(result4, createTileKey({ row: 0, column: 0, level: 20 }));
    });

    it("get tiles of 2x1 subdivison", function () {
        subdivisionScheme.getSubdivisionX.returns(2);
        subdivisionScheme.getSubdivisionY.returns(1);
        subdivisionScheme.getLevelDimensionX.callsFake((level: number) => 1 << level);
        subdivisionScheme.getLevelDimensionY.returns(1);

        const result1 = getSubTileArray(0, 0, 0);
        assert.equal(result1.length, 2);
        assert.deepInclude(result1, createTileKey({ row: 0, column: 0, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 0, column: 1, level: 1 }));

        const result2 = getSubTileArray(0, 1, 1);
        assert.equal(result2.length, 2);
        assert.deepInclude(result2, createTileKey({ row: 0, column: 2, level: 2 }));
        assert.deepInclude(result2, createTileKey({ row: 0, column: 3, level: 2 }));

        const result3 = getSubTileArray(0, 2, 2);
        assert.equal(result3.length, 2);
        assert.deepInclude(result3, createTileKey({ row: 0, column: 4, level: 3 }));
        assert.deepInclude(result3, createTileKey({ row: 0, column: 5, level: 3 }));

        const result4 = getSubTileArray(0, 9, 14);
        assert.equal(result4.length, 2);
        assert.deepInclude(result4, createTileKey({ row: 0, column: 18, level: 15 }));
        assert.deepInclude(result4, createTileKey({ row: 0, column: 19, level: 15 }));
    });

    it("get tiles of 1x2 subdivison", function () {
        subdivisionScheme.getSubdivisionX.returns(1);
        subdivisionScheme.getSubdivisionY.returns(2);
        subdivisionScheme.getLevelDimensionX.returns(1);
        subdivisionScheme.getLevelDimensionY.callsFake((level: number) => 1 << level);

        const result1 = getSubTileArray(0, 0, 0);
        assert.equal(result1.length, 2);
        assert.deepInclude(result1, createTileKey({ row: 0, column: 0, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 1, column: 0, level: 1 }));

        const result2 = getSubTileArray(1, 0, 1);
        assert.equal(result2.length, 2);
        assert.deepInclude(result2, createTileKey({ row: 2, column: 0, level: 2 }));
        assert.deepInclude(result2, createTileKey({ row: 3, column: 0, level: 2 }));

        const result3 = getSubTileArray(2, 0, 2);
        assert.equal(result3.length, 2);
        assert.deepInclude(result3, createTileKey({ row: 4, column: 0, level: 3 }));
        assert.deepInclude(result3, createTileKey({ row: 5, column: 0, level: 3 }));

        const result4 = getSubTileArray(9, 0, 14);
        assert.equal(result4.length, 2);
        assert.deepInclude(result4, createTileKey({ row: 18, column: 0, level: 15 }));
        assert.deepInclude(result4, createTileKey({ row: 19, column: 0, level: 15 }));
    });

    it("get tiles of 2x2 subdivison", function () {
        subdivisionScheme.getSubdivisionX.returns(2);
        subdivisionScheme.getSubdivisionY.returns(2);
        subdivisionScheme.getLevelDimensionX.callsFake((level: number) => 1 << level);
        subdivisionScheme.getLevelDimensionY.callsFake((level: number) => 1 << level);

        const result1 = getSubTileArray(0, 0, 0);
        assert.equal(result1.length, 4);
        assert.deepInclude(result1, createTileKey({ row: 0, column: 0, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 0, column: 1, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 1, column: 0, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 1, column: 1, level: 1 }));

        const result2 = getSubTileArray(11, 7, 4);
        assert.equal(result2.length, 4);
        assert.deepInclude(result2, createTileKey({ row: 22, column: 14, level: 5 }));
        assert.deepInclude(result2, createTileKey({ row: 22, column: 15, level: 5 }));
        assert.deepInclude(result2, createTileKey({ row: 23, column: 14, level: 5 }));
        assert.deepInclude(result2, createTileKey({ row: 23, column: 15, level: 5 }));
    });

    it("get tiles of double umbrella subdivison", function () {
        subdivisionScheme.getSubdivisionX.returns(2);
        subdivisionScheme.getSubdivisionY.callsFake((level: number) => (level === 0 ? 2 : 1));
        subdivisionScheme.getLevelDimensionX.callsFake((level: number) => 1 << level);
        subdivisionScheme.getLevelDimensionY.callsFake((level: number) => (level === 0 ? 1 : 2));

        const result1 = getSubTileArray(0, 0, 0);
        assert.equal(result1.length, 4);
        assert.deepInclude(result1, createTileKey({ row: 0, column: 0, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 0, column: 1, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 1, column: 0, level: 1 }));
        assert.deepInclude(result1, createTileKey({ row: 1, column: 1, level: 1 }));

        const result2 = getSubTileArray(1, 61, 7);
        assert.equal(result2.length, 2);
        assert.deepInclude(result2, createTileKey({ row: 1, column: 122, level: 8 }));
        assert.deepInclude(result2, createTileKey({ row: 1, column: 123, level: 8 }));

        const result3 = getSubTileArray(0, 44, 15);
        assert.equal(result3.length, 2);
        assert.deepInclude(result3, createTileKey({ row: 0, column: 88, level: 16 }));
        assert.deepInclude(result3, createTileKey({ row: 0, column: 89, level: 16 }));
    });
});
