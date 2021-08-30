/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";

import { TileKey } from "../lib/tiling/TileKey";
import { TileKeyUtils } from "../lib/tiling/TileKeyUtils";

describe("TileKeyUtils", function () {
    it("test getKeyForTileKeyAndOffset and extractOffsetAndMortonKeyFromKey", async function () {
        // This allows 8 offsets to be stored, -4 -> 3, we test also outside this range
        const bitshift = 3;
        const offsets = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
        // Binary is the easist to read, here you can see the -4 -> 3 is mapped to 0 -> 7
        // in the 3 highest bits.
        const results = [
            0b11100000000000000000000000000000000000000000000000111,
            0b00000000000000000000000000000000000000000000000000111,
            0b00100000000000000000000000000000000000000000000000111,
            0b01000000000000000000000000000000000000000000000000111,
            0b01100000000000000000000000000000000000000000000000111,
            0b10000000000000000000000000000000000000000000000000111,
            0b10100000000000000000000000000000000000000000000000111,
            0b11000000000000000000000000000000000000000000000000111,
            0b11100000000000000000000000000000000000000000000000111,
            // Check that we wrap back around to 0
            0b00000000000000000000000000000000000000000000000000111,
            0b00100000000000000000000000000000000000000000000000111
        ];
        const offsetResults = [3, -4, -3, -2, -1, 0, 1, 2, 3, -4, -3];
        const tileKey = TileKey.fromRowColumnLevel(1, 1, 1);
        for (let i = 0; i < offsets.length; i++) {
            const keyByTileKeyAndOffset = TileKeyUtils.getKeyForTileKeyAndOffset(
                tileKey,
                offsets[i],
                bitshift
            );
            expect(keyByTileKeyAndOffset).to.be.equal(results[i]);

            const { offset, mortonCode } = TileKeyUtils.extractOffsetAndMortonKeyFromKey(
                keyByTileKeyAndOffset,
                bitshift
            );
            expect(offset).to.be.equal(offsetResults[i]);
            expect(mortonCode).to.be.equal(tileKey.mortonCode());
        }
    });
});
