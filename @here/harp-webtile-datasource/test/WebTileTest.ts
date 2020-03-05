/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { WebTileDataSource } from "../index";

describe("WebTileDataSource", function() {
    it("ok", function() {
        assert.isTrue(true);
    });

    it("#createWebTileDataSource has default values", async function() {
        const apikey = "123";
        const webTileDataSource = new WebTileDataSource({
            apikey
        });
        assert(webTileDataSource.maxZoomLevel === 19);
    });
    it("#createWebTileDataSource with 256px and ppi320", async function() {
        const apikey = "123";
        const webTileDataSource = new WebTileDataSource({
            apikey,
            resolution: WebTileDataSource.resolutionValue.resolution256,
            ppi: WebTileDataSource.ppiValue.ppi320
        });
        assert(webTileDataSource.maxZoomLevel === 20);
    });
    it("#createWebTileDataSource with satellite.day", async function() {
        const apikey = "123";
        const webTileDataSource = new WebTileDataSource({
            apikey,
            tileBaseAddress: WebTileDataSource.TILE_AERIAL_SATELLITE
        });
        assert(webTileDataSource.maxZoomLevel === 19);
    });
    it("#createWebTileDataSource with satellite.day and 256px", async function() {
        const apikey = "123";
        const webTileDataSource = new WebTileDataSource({
            apikey,
            tileBaseAddress: WebTileDataSource.TILE_AERIAL_SATELLITE,
            resolution: WebTileDataSource.resolutionValue.resolution256
        });
        assert(webTileDataSource.maxZoomLevel === 20);
    });
    it("#createWebTileDataSource with satellite.day and ppi320", async function() {
        const apikey = "123";
        assert.throw(
            () =>
                new WebTileDataSource({
                    apikey,
                    tileBaseAddress: WebTileDataSource.TILE_AERIAL_SATELLITE,
                    ppi: WebTileDataSource.ppiValue.ppi320
                })
        );
    });
});
