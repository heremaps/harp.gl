/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { DecodedTile, Geometry, ITileDecoder, TileInfo } from "@here/harp-datasource-protocol";
import {
    Projection,
    TileKey,
    TilingScheme,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { DataSource, MapView, Statistics, Tile, TileLoaderState } from "@here/harp-mapview";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const { expect } = chai;
import { DataProvider, TileLoader } from "../index";

class MockDataSource extends DataSource {
    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        return undefined;
    }
}

class MockDataProvider implements DataProvider {
    constructor(public failsRequests: boolean = false, public emptyPayload: boolean = false) {}

    async connect() {
        // empty implementation
    }

    ready(): boolean {
        return true;
    }

    async getTile(): Promise<ArrayBuffer> {
        if (this.failsRequests) {
            return Promise.reject(new Error("No connection."));
        } else if (this.emptyPayload) {
            return Promise.resolve(new ArrayBuffer(0));
        }

        return Promise.resolve(new ArrayBuffer(5));
    }
}

const fakeGeometry = {};
const fakeEmptyGeometry = {
    foo: "bar",
    geometries: [fakeGeometry as Geometry],
    techniques: []
};

class MockTileDecoder implements ITileDecoder {
    async connect() {
        // connect is not used
    }

    dispose() {
        // dispose is not used
    }

    async decodeTile(): Promise<DecodedTile> {
        return Promise.resolve(fakeEmptyGeometry);
    }

    async getTileInfo(
        _data: ArrayBufferLike,
        _tileKey: TileKey,
        _projection: Projection
    ): Promise<TileInfo | undefined> {
        return Promise.resolve(undefined);
    }

    configure() {
        // no configuration needed for mock
    }
}

function createMockMapView() {
    return ({
        projection: webMercatorProjection,
        // tslint:disable-next-line:no-empty
        getDataSourceByName() {},
        statistics: new Statistics()
    } as any) as MapView;
}

describe("TileLoader", function() {
    let tileKey: TileKey;
    let mapView: MapView;
    let dataSource: DataSource;
    let dataProvider: MockDataProvider;

    before(function() {
        tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        mapView = createMockMapView();
        dataSource = new MockDataSource();
        dataSource.attach(mapView);
        dataProvider = new MockDataProvider(true);
    });

    beforeEach(function() {
        dataProvider.failsRequests = false;
        dataProvider.emptyPayload = false;
    });

    describe("loadAndDecode()", function() {
        it("should load tiles", function() {
            const tileLoader = new TileLoader(
                dataSource,
                tileKey,
                dataProvider,
                new MockTileDecoder(),
                0
            );

            const loadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled;
        });

        it("should not reload already requested tile", function() {
            const tileLoader = new TileLoader(
                dataSource,
                tileKey,
                dataProvider,
                new MockTileDecoder(),
                0
            );

            const loadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(loadPromise).to.not.be.undefined;

            const secondLoadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(secondLoadPromise).to.not.be.undefined;
            expect(secondLoadPromise).to.equal(loadPromise);

            return expect(loadPromise).to.eventually.be.fulfilled;
        });

        it("should handle empty payloads", function() {
            const tileLoader = new TileLoader(
                dataSource,
                tileKey,
                dataProvider,
                new MockTileDecoder(),
                0
            );

            dataProvider.emptyPayload = true;
            let loadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.state).to.equal(TileLoaderState.Ready);

                dataProvider.emptyPayload = false;
                loadPromise = tileLoader.loadAndDecode();
                // tslint:disable-next-line: no-unused-expression
                expect(loadPromise).to.not.be.undefined;

                return expect(loadPromise).to.eventually.be.fulfilled;
            });
        });

        it("should recover from losing internet connection", function() {
            const tileLoader = new TileLoader(
                dataSource,
                tileKey,
                dataProvider,
                new MockTileDecoder(),
                0
            );

            dataProvider.failsRequests = true;
            const loadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.rejected.then(() => {
                expect(tileLoader.state).to.equal(TileLoaderState.Failed);
                dataProvider.failsRequests = false;

                // tslint:disable-next-line: no-shadowed-variable
                const loadPromise = tileLoader.loadAndDecode();
                // tslint:disable-next-line: no-unused-expression
                expect(loadPromise).to.not.be.undefined;

                return expect(loadPromise).to.eventually.be.fulfilled;
            });
        });
    });

    describe("cancel()", function() {
        it("should cancel running requests", function() {
            const tileLoader = new TileLoader(
                dataSource,
                tileKey,
                dataProvider,
                new MockTileDecoder(),
                0
            );

            const loadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(loadPromise).to.not.be.undefined;

            tileLoader.cancel();
            expect(tileLoader.state).to.equal(TileLoaderState.Canceled);

            return expect(loadPromise).to.eventually.be.rejected;
        });

        it("should cancel during decoding", function() {
            const tileLoader = new TileLoader(
                dataSource,
                tileKey,
                dataProvider,
                new MockTileDecoder(),
                0
            );
            const loadPromise = tileLoader.loadAndDecode();
            // tslint:disable-next-line: no-unused-expression
            expect(loadPromise).to.not.be.undefined;

            // mock loaded data state
            tileLoader.payload = new ArrayBuffer(5);
            tileLoader.state = TileLoaderState.Loaded;
            (tileLoader as any).startDecodeTile();

            tileLoader.cancel();
            expect(tileLoader.state).to.equal(TileLoaderState.Canceled);

            return expect(loadPromise).to.eventually.be.rejected;
        });
    });
});
