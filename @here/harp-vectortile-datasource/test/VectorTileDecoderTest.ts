/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { expect } from "chai";

import { VectorTileDecoder } from "../index-worker";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("ThemedTileDecoder", function () {
    it("#decodeTile does not throw", async function () {
        const target = new VectorTileDecoder();

        silenceLoggingAroundFunction("ThemedTileDecoder", async () => {
            expect(
                await target.decodeTile(
                    new ArrayBuffer(0),
                    new TileKey(0, 0, 0),
                    mercatorProjection
                )
            ).to.not.throw;
        });
    });
});
