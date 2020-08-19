/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { LoggerManager } from "@here/harp-utils";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";
chai.use(chaiAsPromised);
const { expect } = chai;
import { DataProvider, TileLoader } from "../index";

// Needed for using expect(...).true for example

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
    constructor() {
        // empty implementation
    }

    async connect() {
        // empty implementation
    }

    ready(): boolean {
        return true;
    }

    async getTile(): Promise<ArrayBufferLike | {}> {
        return await Promise.resolve(new ArrayBuffer(5));
    }

    /** @override */ dispose() {
        // Nothing to be done here.
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
        return await Promise.resolve(fakeEmptyGeometry);
    }

    async getTileInfo(
        _data: ArrayBufferLike,
        _tileKey: TileKey,
        _projection: Projection
    ): Promise<TileInfo | undefined> {
        return await Promise.resolve(undefined);
    }

    configure() {
        // no configuration needed for mock
    }
}

function createMockMapView() {
    return ({
        projection: webMercatorProjection,
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
    });

    beforeEach(function() {
        dataProvider = new MockDataProvider();
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
            expect(loadPromise).to.not.be.undefined;

            const secondLoadPromise = tileLoader.loadAndDecode();
            expect(secondLoadPromise).to.not.be.undefined;
            expect(secondLoadPromise).to.equal(loadPromise);

            return expect(loadPromise).to.eventually.be.fulfilled;
        });

        it("should handle empty payloads", function() {
            const tileDecoder = new MockTileDecoder();
            const decodeTileSpy = sinon.spy(tileDecoder, "decodeTile");
            const tileLoader = new TileLoader(dataSource, tileKey, dataProvider, tileDecoder, 0);

            const getTileStub = sinon.stub(dataProvider, "getTile").resolves(new ArrayBuffer(0));
            let loadPromise = tileLoader.loadAndDecode();
            expect(loadPromise).to.not.be.undefined;

            return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                expect(tileLoader.state).to.equal(TileLoaderState.Ready);
                expect(decodeTileSpy.notCalled).to.be.true;
                getTileStub.resolves({});
                loadPromise = tileLoader.loadAndDecode();
                expect(loadPromise).to.not.be.undefined;

                return expect(loadPromise).to.eventually.be.fulfilled.then(() => {
                    expect(decodeTileSpy.notCalled).to.be.true;
                });
            });
        });

        describe("loadAndDecode()", function() {
            let tileLoader: TileLoader;
            this.beforeEach(() => {
                tileLoader = new TileLoader(
                    dataSource,
                    tileKey,
                    dataProvider,
                    new MockTileDecoder(),
                    0
                );
                LoggerManager.instance.update("TileLoader", { enabled: false });
            });
            this.afterEach(() => {
                LoggerManager.instance.update("TileLoader", { enabled: false });
            });

            it("should recover from losing internet connection", function() {
                // This test writes an error to the console, so we disable it.
                LoggerManager.instance.update("TileLoader", { enabled: false });

                const getTileStub = sinon
                    .stub(dataProvider, "getTile")
                    .rejects(new Error("No connection."));
                const loadPromise = tileLoader.loadAndDecode();
                expect(loadPromise).to.not.be.undefined;

                // Chai.PromisedAssertion doesn't have .finally unfortunately.
                return expect(loadPromise).to.eventually.be.rejected.then(() => {
                    expect(tileLoader.state).to.equal(TileLoaderState.Failed);

                    getTileStub.restore();
                    const loadPromise = tileLoader.loadAndDecode();
                    expect(loadPromise).to.not.be.undefined;

                    return expect(loadPromise).to.eventually.be.fulfilled;
                });
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

    describe("tile load", function() {
        // Note, this test can't be in TileTest.ts because the TileLoader is not part of the
        // @here/harp-mapview package, and trying to add package which contains the TileLoader
        // as a dependency causes a loop which isn't allowed.
        it("tile load sets dependencies from decoded tile", async function() {
            const dependencies: number[] = [0, 1];
            const decodedTile: DecodedTile = {
                techniques: [],
                geometries: [],
                dependencies
            };
            const tileLoader = sinon.createStubInstance(TileLoader);
            tileLoader.decodedTile = decodedTile;
            tileLoader.loadAndDecode.returns(Promise.resolve(TileLoaderState.Ready));
            const tile = new Tile(dataSource, tileKey);
            tile.tileLoader = tileLoader;
            await tile.load();
            expect(tile.dependencies).to.be.deep.eq(
                dependencies.map(morton => TileKey.fromMortonCode(morton))
            );
        });
    });
});
