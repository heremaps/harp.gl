/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import "@here/harp-fetch";

import {
    DecodedTile,
    DecoderOptions,
    Geometry,
    ITileDecoder,
    StyleSet,
    TileInfo
} from "@here/harp-datasource-protocol";
import {
    Projection,
    TileKey,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { DataSource, MapView, Statistics, Tile, TileLoaderState } from "@here/harp-mapview";
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { assert, expect } from "chai";
import * as sinon from "sinon";

import { DataProvider, TileDataSource, TileFactory } from "../index";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

class MockDataProvider extends DataProvider {
    /** @override */ async connect() {
        // empty implementation
    }

    ready(): boolean {
        return true;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBuffer> {
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

function createMockTileDecoder() {
    const mockTemplate: ITileDecoder = {
        async connect() {
            // connect is not used
        },
        dispose() {
            // dispose is not used
        },
        async decodeTile(): Promise<DecodedTile> {
            return await Promise.resolve(fakeEmptyGeometry);
        },
        async getTileInfo(
            _data: ArrayBufferLike,
            _tileKey: TileKey,
            _projection: Projection
        ): Promise<TileInfo | undefined> {
            return await Promise.resolve(undefined);
        },
        configure(options: DecoderOptions) {
            // no configuration needed for mock
        }
    };
    const mock = sinon.stub(mockTemplate);
    mock.decodeTile.resolves(fakeEmptyGeometry);
    return mock;
}

function createMockMapView() {
    return ({
        projection: webMercatorProjection,
        getDataSourceByName() {},
        statistics: new Statistics(),
        frameNumber: 0,
        clearTileCache: () => {}
    } as any) as MapView;
}

describe("TileDataSource", function () {
    it("#dispose cascades to decoder", function () {
        const decoder = createMockTileDecoder();
        const testedDataSource = new TileDataSource(new TileFactory(Tile), {
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: new MockDataProvider(),
            decoder
        });

        assert.equal(decoder.dispose.callCount, 0);
        testedDataSource.dispose();
        assert.equal(decoder.dispose.callCount, 1);
    });
    it("uses tileFactory to construct tiles with custom type", function () {
        class CustomTile extends Tile {
            constructor(dataSource: DataSource, tileKey: TileKey) {
                super(dataSource, tileKey);
            }
        }

        const testedDataSource = new TileDataSource(new TileFactory(CustomTile), {
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: new MockDataProvider(),
            decoder: createMockTileDecoder()
        });
        testedDataSource.attach(createMockMapView());

        const mockTile = testedDataSource.getTile(TileKey.fromRowColumnLevel(0, 0, 0));

        assert(mockTile instanceof CustomTile);
    });

    it("#updateTile: tile disposing cancels load, skips decode and tile update", async function () {
        const mockDataProvider = new MockDataProvider();

        const abortController = new AbortController();
        let getTileToken = abortController.signal;
        const getTileStub = sinon.stub(mockDataProvider, "getTile");
        getTileStub.callsFake((_tileKey: any, cancellationToken: any) => {
            assert(cancellationToken !== undefined);
            assert(cancellationToken instanceof AbortSignal);
            getTileToken = cancellationToken;
            return Promise.resolve(new ArrayBuffer(5));
        });

        const mockDecoder = createMockTileDecoder();
        mockDecoder.decodeTile.resolves(fakeEmptyGeometry);

        const testedDataSource = new TileDataSource(new TileFactory(Tile), {
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: mockDataProvider,
            decoder: mockDecoder
        });

        testedDataSource.attach(createMockMapView());

        const tile = testedDataSource.getTile(TileKey.fromRowColumnLevel(0, 0, 0))!;
        assert(tile);

        const spyTileSetDecodedTile = sinon.spy(tile, "decodedTile", ["set"]) as any;

        const savedLoader = tile.tileLoader;
        const tileLoaderSettled = savedLoader!.waitSettled();
        assert.exists(savedLoader);
        tile.dispose();

        // Catch the promise rejection (Cancelled).
        await tileLoaderSettled.catch(tileLoaderState => {
            assert.equal(tileLoaderState, TileLoaderState.Canceled);
        });

        assert.notExists(tile.tileLoader);

        assert.equal(getTileStub.callCount, 1);
        assert.equal(getTileToken.aborted, true);
        assert.equal(mockDecoder.decodeTile.callCount, 0);
        assert.equal(spyTileSetDecodedTile.set.callCount, 0);
    });

    it("subsequent, overlapping #updateTile calls load & decode tile once", async function () {
        const mockDataProvider = new MockDataProvider();
        const getTileSpy = sinon.spy(mockDataProvider, "getTile");
        const mockDecoder = createMockTileDecoder();

        mockDecoder.decodeTile.resolves(fakeEmptyGeometry);

        const testedDataSource = new TileDataSource(new TileFactory(Tile), {
            name: "tds",
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: mockDataProvider,
            decoder: mockDecoder
        });
        testedDataSource.attach(createMockMapView());

        const tile = testedDataSource.getTile(TileKey.fromRowColumnLevel(0, 0, 0))!;
        assert(tile);

        const spyTileSetDecodedTile = sinon.spy(tile, "decodedTile", ["set"]) as any;

        // act
        testedDataSource.updateTile(tile);
        testedDataSource.updateTile(tile);
        testedDataSource.updateTile(tile);

        await tile.tileLoader!.waitSettled();

        // assert
        assert.equal(getTileSpy.callCount, 1);
        assert.equal(mockDecoder.decodeTile.callCount, 1);
        assert(spyTileSetDecodedTile.set.calledWith(fakeEmptyGeometry));
    });

    function getDataSource() {
        const mockDataProvider = new MockDataProvider();
        const mockDecoder = createMockTileDecoder();

        mockDecoder.decodeTile.resolves(fakeEmptyGeometry);

        const testedDataSource = new TileDataSource(new TileFactory(Tile), {
            name: "tds",
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: mockDataProvider,
            decoder: mockDecoder
        });
        testedDataSource.attach(createMockMapView());
        return { testedDataSource, mockDataProvider, mockDecoder };
    }

    it("subsequent, overlapping #getTile calls don't share TileLoader", async function () {
        const mockedDataSource = getDataSource();
        const getTileSpy = sinon.spy(mockedDataSource.mockDataProvider, "getTile");
        const tile1 = mockedDataSource.testedDataSource.getTile(
            TileKey.fromRowColumnLevel(0, 0, 0)
        )!;
        assert(tile1);
        const spyTileSetDecodedTile1 = sinon.spy(tile1, "decodedTile", ["set"]) as any;

        const tile2 = mockedDataSource.testedDataSource.getTile(
            TileKey.fromRowColumnLevel(1, 1, 1)
        )!;
        assert(tile2);
        const spyTileSetDecodedTile2 = sinon.spy(tile2, "decodedTile", ["set"]) as any;

        // Waiting on the first tileloader doesn't influence the second one.
        await tile1.tileLoader!.waitSettled();
        await tile2.tileLoader!.waitSettled();
        assert.equal(getTileSpy.callCount, 2);
        // Check that two tiles are decoded.
        assert.equal(mockedDataSource.mockDecoder.decodeTile.callCount, 2);
        assert.equal(spyTileSetDecodedTile1.set.callCount, 1);
        assert.equal(spyTileSetDecodedTile2.set.callCount, 1);
        assert(spyTileSetDecodedTile1.set.calledWith(fakeEmptyGeometry));
        assert(spyTileSetDecodedTile2.set.calledWith(fakeEmptyGeometry));
    });

    it("Empty decoded tiles are ignored", async function () {
        const mockDataProvider = new MockDataProvider();
        const mockDecoder = createMockTileDecoder();

        fakeEmptyGeometry.geometries = [];

        mockDecoder.decodeTile.resolves(fakeEmptyGeometry);

        const testedDataSource = new TileDataSource(new TileFactory(Tile), {
            name: "tds",
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: mockDataProvider,
            decoder: mockDecoder
        });
        testedDataSource.attach(createMockMapView());

        const tile = testedDataSource.getTile(TileKey.fromRowColumnLevel(0, 0, 0))!;
        assert(tile);

        // act
        testedDataSource.updateTile(tile);

        await tile.tileLoader!.waitSettled();

        // assert
        assert.equal(tile.hasGeometry, true);
    });

    it("Currently used tile loaders aren't canceled", async function () {
        const mockedDataSource = getDataSource();
        const { testedDataSource } = mockedDataSource;
        const numTiles = 32;

        // Request more tile loaders that fit into tile loader cache
        const tiles: Tile[] = [];
        for (let i = 0; i < numTiles; ++i) {
            const tile = testedDataSource.getTile(TileKey.fromMortonCode(i));
            tiles.push(tile!);
        }

        // Check that no tile loader was canceled
        for (const tile of tiles) {
            assert.notEqual(tile.tileLoader!.state, TileLoaderState.Canceled);

            await tile.tileLoader!.waitSettled();
            assert(tile.tileLoader!.isFinished);
        }
    });

    it("supports deprecated minZoomLevel and maxZoomLevel in constructor", function () {
        silenceLoggingAroundFunction("DataSource", () => {
            const testedDataSource = new TileDataSource(new TileFactory(Tile), {
                styleSetName: "",
                tilingScheme: webMercatorTilingScheme,
                dataProvider: new MockDataProvider(),
                decoder: createMockTileDecoder(),
                minZoomLevel: 3,
                maxZoomLevel: 17
            });

            assert.equal(testedDataSource.minZoomLevel, 3);
            assert.equal(testedDataSource.minDataLevel, 3);
            assert.equal(testedDataSource.maxZoomLevel, 17);
            assert.equal(testedDataSource.maxDataLevel, 17);
        });
    });

    it("supports setting of theme", async function () {
        const mockDecoder = createMockTileDecoder();
        silenceLoggingAroundFunction("DataSource", async () => {
            const testedDataSource = new TileDataSource(new TileFactory(Tile), {
                styleSetName: "tilezen",
                tilingScheme: webMercatorTilingScheme,
                dataProvider: new MockDataProvider(),
                decoder: mockDecoder,
                minZoomLevel: 3,
                maxZoomLevel: 17
            });

            testedDataSource.attach(createMockMapView());

            const styles: StyleSet = [
                {
                    styleSet: "tilezen",
                    technique: "none"
                }
            ];

            await testedDataSource.setTheme({
                styles
            });

            assert(mockDecoder.configure.calledOnce);
            assert(mockDecoder.configure.calledWith(sinon.match({ styleSet: styles })));
        });
    });

    it("supports setting of languages", async function () {
        const mockDecoder = createMockTileDecoder();
        silenceLoggingAroundFunction("DataSource", async () => {
            const testedDataSource = new TileDataSource(new TileFactory(Tile), {
                styleSetName: "tilezen",
                tilingScheme: webMercatorTilingScheme,
                dataProvider: new MockDataProvider(),
                decoder: mockDecoder,
                minZoomLevel: 3,
                maxZoomLevel: 17,
                languages: ["de"]
            });

            await testedDataSource.connect();

            expect(mockDecoder.configure.calledOnce).to.be.true;
            expect(mockDecoder.configure.calledWith(sinon.match({ languages: ["de"] }))).to.be.true;

            testedDataSource.attach(createMockMapView());

            testedDataSource.setLanguages(["de", "en"]);

            expect(mockDecoder.configure.calledTwice).to.be.true;
            expect(mockDecoder.configure.calledWith(sinon.match({ languages: ["de", "en"] }))).to.be
                .true;
        });
    });
});
