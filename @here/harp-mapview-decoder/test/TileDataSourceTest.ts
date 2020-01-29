/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { DecodedTile, Geometry, ITileDecoder, TileInfo } from "@here/harp-datasource-protocol";
import "@here/harp-fetch";
import {
    Projection,
    TileKey,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { DataSource, MapView, Statistics, Tile, TileLoaderState } from "@here/harp-mapview";
import { assert } from "chai";
import * as sinon from "sinon";
import { DataProvider, TileDataSource, TileFactory } from "../index";

function createMockDataProvider() {
    const mockTemplate: DataProvider = {
        async connect() {
            // empty implementation
        },
        ready(): boolean {
            return true;
        },
        async getTile(): Promise<ArrayBuffer> {
            return Promise.resolve(new ArrayBuffer(5));
        }
    };
    const mock = sinon.stub(mockTemplate);
    mock.getTile.callsFake(() => {
        return Promise.resolve(new ArrayBuffer(5));
    });
    return mock;
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
            return Promise.resolve(fakeEmptyGeometry);
        },
        async getTileInfo(
            _data: ArrayBufferLike,
            _tileKey: TileKey,
            _projection: Projection
        ): Promise<TileInfo | undefined> {
            return Promise.resolve(undefined);
        },
        configure() {
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
        // tslint:disable-next-line:no-empty
        getDataSourceByName() {},
        statistics: new Statistics(),
        frameNumber: 0
    } as any) as MapView;
}

describe("TileDataSource", function() {
    it("#dispose cascades to decoder", function() {
        const decoder = createMockTileDecoder();
        const testedDataSource = new TileDataSource(new TileFactory(Tile), {
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: createMockDataProvider(),
            decoder
        });

        assert.equal(decoder.dispose.callCount, 0);
        testedDataSource.dispose();
        assert.equal(decoder.dispose.callCount, 1);
    });
    it("uses tileFactory to construct tiles with custom type", function() {
        class CustomTile extends Tile {
            constructor(dataSource: DataSource, tileKey: TileKey) {
                super(dataSource, tileKey);
            }
        }

        const testedDataSource = new TileDataSource(new TileFactory(CustomTile), {
            styleSetName: "",
            tilingScheme: webMercatorTilingScheme,
            dataProvider: createMockDataProvider(),
            decoder: createMockTileDecoder()
        });
        testedDataSource.attach(createMockMapView());

        const mockTile = testedDataSource.getTile(TileKey.fromRowColumnLevel(0, 0, 0));

        assert(mockTile instanceof CustomTile);
    });

    it("#updateTile: tile disposing cancels load, skips decode and tile update", async function() {
        const mockDataProvider = createMockDataProvider();

        const abortController = new AbortController();
        let getTileToken = abortController.signal;
        mockDataProvider.getTile.callsFake((_tileKey: any, cancellationToken: any) => {
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

        assert.equal(mockDataProvider.getTile.callCount, 1);
        assert.equal(getTileToken.aborted, true);
        assert.equal(mockDecoder.decodeTile.callCount, 0);
        assert.equal(spyTileSetDecodedTile.set.callCount, 0);
    });

    it("subsequent, overlapping #updateTile calls load & decode tile once", async function() {
        const mockDataProvider = createMockDataProvider();
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
        assert.equal(mockDataProvider.getTile.callCount, 1);
        assert.equal(mockDecoder.decodeTile.callCount, 1);
        assert(spyTileSetDecodedTile.set.calledWith(fakeEmptyGeometry));
    });

    function getDataSource() {
        const mockDataProvider = createMockDataProvider();
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

    it("subsequent, overlapping #getTile calls don't share TileLoader", async function() {
        const mockedDataSource = getDataSource();
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
        assert.equal(mockedDataSource.mockDataProvider.getTile.callCount, 2);
        // Check that two tiles are decoded.
        assert.equal(mockedDataSource.mockDecoder.decodeTile.callCount, 2);
        assert.equal(spyTileSetDecodedTile1.set.callCount, 1);
        assert.equal(spyTileSetDecodedTile2.set.callCount, 1);
        assert(spyTileSetDecodedTile1.set.calledWith(fakeEmptyGeometry));
        assert(spyTileSetDecodedTile2.set.calledWith(fakeEmptyGeometry));
    });

    it("Empty decoded tiles are ignored", async function() {
        const mockDataProvider = createMockDataProvider();
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

    it("Currently used tile loaders aren't canceled", async function() {
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
});
