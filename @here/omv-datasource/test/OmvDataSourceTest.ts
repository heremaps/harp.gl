/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { CancellationToken } from "@here/fetch";
import { TileKey } from "@here/geoutils";
import { DataProvider } from "@here/mapview-decoder";
import { assert } from "chai";
import { APIFormat, OmvDataSource, OmvRestClient } from "../index";
import { OmvTileDecoder } from "../index-worker";

class MockDataProvider extends DataProvider {
    constructor() {
        super();
    }

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
        _cancellationToken?: CancellationToken | undefined
    ): Promise<ArrayBufferLike> {
        return new ArrayBuffer(0);
    }
}

describe("DataProviders", () => {
    it("Generates a OmvDataSource with a custom DataProvider", () => {
        const mockDataProvider = new MockDataProvider();
        const omvDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            dataProvider: mockDataProvider
        });
        assert.equal(omvDataSource.dataProvider(), mockDataProvider);
        assert.isTrue(omvDataSource.dataProvider() instanceof MockDataProvider);
    });

    it("Generates a OmvDataSource with a REST based DataProvider", () => {
        const omvDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            baseUrl: "https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v7",
            apiFormat: APIFormat.MapboxV4,
            authenticationCode: "123"
        });
        assert.isTrue(omvDataSource.dataProvider() instanceof OmvRestClient);
    });

    it("Generates an OmvDataSource with custom DataProvider, ignoring other provider attributes",
        () => {
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
