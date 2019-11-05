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
import {
    APIFormat,
    AuthenticationTypeAccessToken,
    VectorTileDataSource,
    VectorTileRestClient
} from "../index";
import { VectorTileDecoder } from "../index-worker";

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
        const vtDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            dataProvider: mockDataProvider
        });
        assert.equal(vtDataSource.dataProvider(), mockDataProvider);
        assert.isTrue(vtDataSource.dataProvider() instanceof MockDataProvider);
    });

    it("Creates a VectorTileDataSource with a REST based DataProvider with proper params", () => {
        const vtDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            authenticationMethod: AuthenticationTypeAccessToken
        });
        const provider = vtDataSource.dataProvider();
        assert.instanceOf(provider, VectorTileRestClient);

        const vtRestClientProvider = provider as VectorTileRestClient;
        assert.equal(
            vtRestClientProvider.params.baseUrl,
            "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7"
        );
        assert.equal(vtRestClientProvider.params.apiFormat, APIFormat.MapboxV4);
        assert.equal(vtRestClientProvider.params.authenticationCode, "123");
        assert.equal(
            vtRestClientProvider.params.authenticationMethod,
            AuthenticationTypeAccessToken
        );
    });

    it("Creates VectorTileDataSource with custom DataProvider, ignoring other attributes", () => {
        const mockDataProvider = new MockDataProvider();
        const vtDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123",
            dataProvider: mockDataProvider
        });
        assert.isTrue(vtDataSource.dataProvider() instanceof MockDataProvider);
    });
});
