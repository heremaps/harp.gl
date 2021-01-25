/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { HereTileProvider, HereWebTileDataSource, WebTileDataSource } from "../index";

describe("HereWebTileDataSource", function () {
    it("#createWebTileDataSource has default values", async function () {
        const apikey = "123";
        const webTileDataSource = new HereWebTileDataSource({
            apikey
        });
        assert(webTileDataSource.maxDataLevel === 19);
    });
    it("#createWebTileDataSource with token authentication", async function () {
        const webTileDataSource = new HereWebTileDataSource({
            authenticationCode: "foo123"
        });
        assert(webTileDataSource.maxDataLevel === 19);
    });
    it("#createWebTileDataSource with 256px and ppi320", async function () {
        const apikey = "123";
        const webTileDataSource = new HereWebTileDataSource({
            apikey,
            resolution: WebTileDataSource.resolutionValue.resolution256,
            ppi: WebTileDataSource.ppiValue.ppi320
        });
        assert(webTileDataSource.maxDataLevel === 20);
    });
    it("#createWebTileDataSource with satellite.day", async function () {
        const apikey = "123";
        const webTileDataSource = new HereWebTileDataSource({
            apikey,
            tileBaseAddress: HereTileProvider.TILE_AERIAL_SATELLITE
        });
        assert(webTileDataSource.maxDataLevel === 19);
    });
    it("#createWebTileDataSource with satellite.day and 256px", async function () {
        const apikey = "123";
        const webTileDataSource = new HereWebTileDataSource({
            apikey,
            tileBaseAddress: HereTileProvider.TILE_AERIAL_SATELLITE,
            resolution: WebTileDataSource.resolutionValue.resolution256
        });
        assert(webTileDataSource.maxDataLevel === 20);
    });
    it("#createWebTileDataSource throws with satellite.day and ppi320", async function () {
        const apikey = "123";
        assert.throw(
            () =>
                new HereWebTileDataSource({
                    apikey,
                    tileBaseAddress: HereTileProvider.TILE_AERIAL_SATELLITE,
                    ppi: WebTileDataSource.ppiValue.ppi320
                })
        );
    });
    it("#createWebTileDataSource throws w/o auth.", async function () {
        assert.throw(() => new HereWebTileDataSource({} as any));
    });
    it("#createWebTileDataSource throws w/ missing appCode", async function () {
        assert.throw(() => new HereWebTileDataSource({ appId: "42" } as any));
    });
    it("#createWebTileDataSource throws w/ missing appId", async function () {
        assert.throw(() => new HereWebTileDataSource({ appCode: "42" } as any));
    });
    it("#createWebTileDataSource check storageLevelOffset", async function () {
        const apikey = "123";
        for (let storageLevelOffset = -2; storageLevelOffset <= 2; storageLevelOffset++) {
            const webTileDataSource = new HereWebTileDataSource({
                apikey,
                tileBaseAddress: HereTileProvider.TILE_AERIAL_SATELLITE,
                storageLevelOffset
            });
            assert(webTileDataSource.storageLevelOffset === storageLevelOffset);
        }

        // Test the default value
        const webTileDataSource = new HereWebTileDataSource({
            apikey,
            tileBaseAddress: HereTileProvider.TILE_AERIAL_SATELLITE,
            storageLevelOffset: undefined
        });
        assert(webTileDataSource.storageLevelOffset === -1);
    });
});
