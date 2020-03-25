/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";
import { assert } from "chai";
import { APIFormat, AuthenticationTypeAccessToken, RestClient } from "../lib/RestClient";
import { VectorTileDataSource } from "../lib/VectorTileDataSource";
import { VectorTileDecoder } from "../lib/VectorTileDecoder";

class MockDataProvider implements DataProvider {
    /** Overriding abstract method, in this case doing nothing. */
    async connect(): Promise<void> {
        //do nothing
    }

    /** Overriding abstract method, in this case always returning `true`. */
    ready(): boolean {
        return true;
    }

    async getTile(
        _tileKey: TileKey,
        _cancellationToken?: AbortSignal | undefined
    ): Promise<ArrayBufferLike> {
        return new ArrayBuffer(0);
    }
}

describe("DataProviders", function() {
    it("Creates a VectorTileDataSource with a custom DataProvider", function() {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            dataProvider: mockDataProvider
        });
        assert.equal(omvDataSource.dataProvider(), mockDataProvider);
        assert.isTrue(omvDataSource.dataProvider() instanceof MockDataProvider);
    });

    // tslint:disable-next-line: max-line-length
    it("Creates a VectorTileDataSource with a REST based DataProvider with proper params", function() {
        const omvDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            authenticationMethod: AuthenticationTypeAccessToken
        });
        const provider = omvDataSource.dataProvider() as RestClient;
        assert.instanceOf(provider, RestClient);

        assert.equal(
            provider.params.baseUrl,
            "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7"
        );
        assert.equal(provider.params.apiFormat, APIFormat.MapboxV4);
        assert.equal(provider.params.authenticationCode, "123");
        assert.equal(provider.params.authenticationMethod, AuthenticationTypeAccessToken);
    });

    // tslint:disable-next-line: max-line-length
    it("Creates VectorTileDataSource with custom DataProvider, ignoring other attributes", function() {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            dataProvider: mockDataProvider
        });
        assert.isTrue(omvDataSource.dataProvider() instanceof MockDataProvider);
    });

    it("supports deprecated minZoomLevel and maxZoomLevel in constructor", function() {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            dataProvider: mockDataProvider,
            minZoomLevel: 3,
            maxZoomLevel: 17
        });

        // tslint:disable-next-line: deprecation
        assert.equal(omvDataSource.minZoomLevel, 3);
        assert.equal(omvDataSource.minDataLevel, 3);
        // tslint:disable-next-line: deprecation
        assert.equal(omvDataSource.maxZoomLevel, 17);
        assert.equal(omvDataSource.maxDataLevel, 17);
    });

    it("supports minDataLevel and maxDataLevel in constructor", function() {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            dataProvider: mockDataProvider,
            minDataLevel: 3,
            maxDataLevel: 17
        });

        // tslint:disable-next-line: deprecation
        assert.equal(omvDataSource.minZoomLevel, 3);
        assert.equal(omvDataSource.minDataLevel, 3);
        // tslint:disable-next-line: deprecation
        assert.equal(omvDataSource.maxZoomLevel, 17);
        assert.equal(omvDataSource.maxDataLevel, 17);
    });

    describe("storageLevelOffset", function() {
        it("updates storageLevelOffset in decoder options", function() {
            const mapView = {
                markTilesDirty() {
                    /* noop */
                }
            } as any;
            const mockDataProvider = new MockDataProvider();
            const omvDataSource = new VectorTileDataSource({
                decoder: new VectorTileDecoder(),
                baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
                apiFormat: APIFormat.MapboxV4,
                authenticationCode: "123",
                dataProvider: mockDataProvider
            });
            omvDataSource.attach(mapView);
            omvDataSource.storageLevelOffset = 2;
            assert.equal(omvDataSource.storageLevelOffset, 2);
            // tslint:disable-next-line: no-string-literal
            assert.equal(omvDataSource["m_decoderOptions"].storageLevelOffset, 2);
            assert.equal((omvDataSource.decoder as any).m_storageLevelOffset, 2);
        });
    });
});
