/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import "@here/harp-fetch";
import { TileKey } from "@here/harp-geoutils";
import { DataProvider } from "@here/harp-mapview-decoder";
import { assert } from "chai";
import { APIFormat, AuthenticationTypeMapboxV4, OmvDataSource, OmvRestClient } from "../index";
import { OmvTileDecoder } from "../index-worker";

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
    it("Creates a OmvDataSource with a custom DataProvider", function() {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            dataProvider: mockDataProvider
        });
        assert.equal(omvDataSource.dataProvider(), mockDataProvider);
        assert.isTrue(omvDataSource.dataProvider() instanceof MockDataProvider);
    });

    it("Creates a OmvDataSource with a REST based DataProvider with proper params", function() {
        const omvDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            authenticationMethod: AuthenticationTypeMapboxV4
        });
        const provider = omvDataSource.dataProvider();
        assert.instanceOf(provider, OmvRestClient);

        const omvRestClientProvider = provider as OmvRestClient;
        assert.equal(
            omvRestClientProvider.params.baseUrl,
            "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7"
        );
        assert.equal(omvRestClientProvider.params.apiFormat, APIFormat.MapboxV4);
        assert.equal(omvRestClientProvider.params.authenticationCode, "123");
        assert.equal(omvRestClientProvider.params.authenticationMethod, AuthenticationTypeMapboxV4);
    });

    it("Creates OmvDataSource with custom DataProvider, ignoring other attributes", function() {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            dataProvider: mockDataProvider
        });
        assert.isTrue(omvDataSource.dataProvider() instanceof MockDataProvider);
    });
});
