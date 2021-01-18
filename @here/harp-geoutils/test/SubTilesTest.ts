/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { SubTiles } from "../lib/tiling/SubTiles";
import { TileKey } from "../lib/tiling/TileKey";

describe("SubTiles", function () {
    it("iterates through all subtiles", function () {
        const subTiles = new SubTiles(TileKey.fromRowColumnLevel(0, 0, 0), 1, 2);
        const actualSubtiles: TileKey[] = [];

        for (const subTile of subTiles) {
            actualSubtiles.push(subTile);
        }

        assert.equal(actualSubtiles.length, 2);
    });
});
