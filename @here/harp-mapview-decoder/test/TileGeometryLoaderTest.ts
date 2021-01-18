/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    TileKey,
    TilingScheme,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import {
    DataSource,
    ITileLoader,
    MapView,
    Statistics,
    Tile,
    TileLoaderState
} from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { TileGeometryLoader } from "@here/harp-mapview/lib/geometry/TileGeometryLoader";
import { TileTaskGroups } from "@here/harp-mapview/lib/MapView";
import { TaskQueue } from "@here/harp-utils";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

chai.use(chaiAsPromised);
const { expect } = chai;
chai.should();

class FakeVisibleTileSet {
    disposeTile(tile: Tile) {}
}

class FakeTileLoader implements ITileLoader {
    state: TileLoaderState = TileLoaderState.Ready;
    isFinished: boolean = true;
    priority: number = 0;

    loadAndDecode(): Promise<TileLoaderState> {
        return new Promise(() => this.state);
    }

    waitSettled(): Promise<TileLoaderState> {
        return new Promise(() => this.state);
    }

    cancel(): void {
        // do nothing.
    }
}

class MockDataSource extends DataSource {
    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        // Create a tile which is by default visible for test purposes.
        const tile = new Tile(this, tileKey);
        tile.isVisible = true;
        tile.tileLoader = new FakeTileLoader();
        return tile;
    }
}

function createFakeMapView() {
    return ({
        projection: webMercatorProjection,
        getDataSourceByName() {},
        statistics: new Statistics(),
        frameNumber: 5, // must be higher then 0, for tile visibility check
        visibleTileSet: new FakeVisibleTileSet(),
        theme: {},
        taskQueue: new TaskQueue({
            groups: [TileTaskGroups.CREATE, TileTaskGroups.FETCH_AND_DECODE]
        })
    } as any) as MapView;
}

function createFakeDecodedTile(): DecodedTile {
    return {
        techniques: [],
        geometries: []
    };
}

const wait = (ms: number = 0) => new Promise(res => setTimeout(res, ms));

describe("TileGeometryLoader", function () {
    let tileKey: TileKey;
    let tile: Tile;
    let dataSource: DataSource;
    let mapView: MapView;
    let geometryLoader: TileGeometryLoader;
    let sandbox: any;

    before(function () {
        tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
    });

    beforeEach(function () {
        mapView = createFakeMapView();
        dataSource = new MockDataSource();
        dataSource.useGeometryLoader = true;
        dataSource.attach(mapView);
        tile = dataSource.getTile(tileKey)!;
        geometryLoader = (tile as any).m_tileGeometryLoader!;
        sandbox = sinon.createSandbox();
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe("tile preprocessing", function () {
        it("should not load geometry before update", function () {
            expect(geometryLoader.tile.hasGeometry).to.be.false;

            expect(geometryLoader.isFinished).to.be.false;
        });

        it("should start load geometry for decoded tile", async function () {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();

            expect(geometryLoader.isFinished).to.be.false;

            geometryLoader!.update();

            expect(geometryLoader.hasDecodedTile).to.be.true;

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).to.equal(1);
            mapView.taskQueue.processNext(TileTaskGroups.CREATE);

            await geometryLoader.waitFinished().should.be.fulfilled;
            expect(geometryLoader.isFinished).to.be.true;
        });

        it("should not start geometry loading for empty tile", async function () {
            geometryLoader!.update();

            expect(geometryLoader.hasDecodedTile).to.be.false;
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).to.equal(0);
            expect(geometryLoader.isFinished).to.be.false;
        });
    });

    describe("tile geometry creation", function () {
        it("should start processing geometry for decoded tile only once", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spySetDecodedTile = sandbox.spy(geometryLoader, "setDecodedTile") as any;
            expect(spyProcessTechniques.callCount).equal(0);
            expect(spySetDecodedTile.callCount).equal(0);

            // Mimic multiple frame updates.
            geometryLoader!.update();
            await wait();
            geometryLoader!.update();
            await wait();
            geometryLoader!.update();
            await wait();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            expect(spySetDecodedTile.callCount).equal(1);
            expect(spyProcessTechniques.callCount).equal(1);

            await geometryLoader.waitFinished().should.be.fulfilled;
            expect(geometryLoader.isFinished).to.be.true;
        });

        it("should create geometry for decoded tile only once (via taskqueue)", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            // Mimic multiple frame updates.
            geometryLoader!.update();
            await wait();
            geometryLoader!.update();
            await wait();
            geometryLoader!.update();
            await wait();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await geometryLoader.waitFinished().should.be.fulfilled;
            expect(spyProcessTechniques.callCount).equal(1);
            expect(spyCreateGeometries.callCount).equal(1);
            expect(geometryLoader.isFinished).to.be.true;
        });

        it("should not create geometry for invisible tile", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update();
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            tile.isVisible = false;

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await geometryLoader.waitFinished().should.be.rejected;
            expect(spyProcessTechniques.callCount).equal(1);
            expect(spyCreateGeometries.callCount).equal(0, "should not create geometry");
            expect(geometryLoader.isFinished).to.be.false;
        });

        it("should not create geometry for disposed tile ", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update();
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            // Make immediately disposed
            tile.dispose();

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await geometryLoader.waitFinished().should.be.rejected;
            expect(spyProcessTechniques.callCount).equal(1);
            expect(spyCreateGeometries.callCount).equal(0, "should not create geometry");
            expect(geometryLoader.isFinished).to.be.false;
        });

        it("should create geometry for tile which was invisible but now visible", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update();
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            tile.isVisible = false;

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(0);

            await geometryLoader.waitFinished().should.be.rejected;

            expect(spyProcessTechniques.callCount).equal(1);
            expect(spyCreateGeometries.callCount).equal(0, "should not create geometry");
            // The geometry loader doesn't finish, because we expect the task to expire
            expect(geometryLoader.isFinished).to.be.false;

            tile.isVisible = true;
            geometryLoader.reset();
            geometryLoader!.update();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);
            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await geometryLoader.waitFinished().should.be.fulfilled;

            expect(spyProcessTechniques.callCount).equal(2);
            expect(spyCreateGeometries.callCount).equal(1, "should create geometry now");
            expect(geometryLoader.isFinished).to.be.true;
        });

        it("should reload geometry for loaded tile that was reset (invalidated)", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);
            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await geometryLoader.waitFinished().should.be.fulfilled;

            expect(spyProcessTechniques.callCount).equal(1);
            expect(spyCreateGeometries.callCount).equal(1);
            expect(geometryLoader.isFinished).to.be.true;

            // Simulate a reload (e.g. due to a dirty/invalidated tile), loading a new decoded tile.
            geometryLoader.reset();
            tile.decodedTile = createFakeDecodedTile();
            geometryLoader.update();

            expect(geometryLoader.isFinished).to.be.false;
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);
            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await geometryLoader.waitFinished().should.be.fulfilled;

            expect(spyProcessTechniques.callCount).equal(2);
            expect(spyCreateGeometries.callCount).equal(2);
            expect(geometryLoader.isFinished).to.be.true;
        });

        it("should load geometry for disposed tile that was reset", async function () {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update();
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            tile.dispose();

            // Dispose should have rejected the promise.
            await geometryLoader.waitFinished().should.be.rejected;

            // Wait for the geometry creation task to return without creating any geometry.
            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).to.be.true;

            expect(spyProcessTechniques.callCount).equal(1);
            expect(spyCreateGeometries.callCount).equal(0, "should not create geometry");
            expect(geometryLoader.isFinished).to.be.false;

            geometryLoader.reset();
            geometryLoader.update();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);
            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            expect(spyProcessTechniques.callCount).equal(2);
            expect(spyCreateGeometries.callCount).equal(1);

            await geometryLoader.waitFinished().should.be.fulfilled;

            expect(geometryLoader.isFinished).to.be.true;
        });
    });
});
