/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
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
import { DataSource, MapView, Statistics, Tile } from "@here/harp-mapview";
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { TileGeometryLoader } from "@here/harp-mapview/lib/geometry/TileGeometryLoader";
import { TileTaskGroups } from "@here/harp-mapview/lib/MapView";
import { ITileLoader, TileLoaderState } from "@here/harp-mapview/lib/Tile";
import { willEventually } from "@here/harp-test-utils";
import { TaskQueue } from "@here/harp-utils";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as sinon from "sinon";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

chai.use(chaiAsPromised);
const { expect } = chai;
class FakeVisibleTileSet {
    disposeTile(tile: Tile) {}
}

class FakeTileLoader implements ITileLoader {
    state: TileLoaderState = TileLoaderState.Ready;
    isFinished: boolean = false;
    priority: number = 0;

    loadAndDecode(): Promise<TileLoaderState> {
        return new Promise(() => this.state);
    }

    waitSettled(): Promise<TileLoaderState> {
        return new Promise(() => this.state);
    }

    updatePriority(area: number): void {
        // do nothing.
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

describe("TileGeometryLoader", function() {
    let tileKey: TileKey;
    let tile: Tile;
    let dataSource: DataSource;
    let mapView: MapView;
    let geometryLoader: TileGeometryLoader;
    let sandbox: any;

    before(function() {
        tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        mapView = createFakeMapView();
        dataSource = new MockDataSource();
        dataSource.attach(mapView);
    });

    beforeEach(function() {
        tile = dataSource.getTile(tileKey)!;
        geometryLoader = new TileGeometryLoader(tile, mapView.taskQueue);
        tile.tileGeometryLoader = geometryLoader;
        sandbox = sinon.createSandbox();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe("tile preprocessing", function() {
        it("should not load geometry before update", function() {
            expect(geometryLoader.basicGeometryLoaded).to.be.false;

            expect(geometryLoader.allGeometryLoaded).to.be.false;

            return expect(geometryLoader.isFinished).to.be.false;
        });

        it("should not load geometry before tile is decoded", function() {
            geometryLoader.update(undefined, undefined);
            geometryLoader.update(undefined, undefined);

            expect(geometryLoader.geometryCreationPending).to.be.false;

            expect(geometryLoader.basicGeometryLoaded).to.be.false;

            expect(geometryLoader.allGeometryLoaded).to.be.false;

            return expect(geometryLoader.isFinished).to.be.false;
        });

        it("should start load geometry for decoded tile", async function() {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();

            expect(geometryLoader.isFinished).to.be.false;

            geometryLoader!.update(undefined, undefined);

            expect(geometryLoader.geometryCreationPending).to.be.true;

            mapView.taskQueue.processNext(TileTaskGroups.CREATE);

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not start geometry loading for invisible tile", async function() {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();
            tile.isVisible = false;

            geometryLoader!.update(undefined, undefined);

            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not start geometry loading for disposed tile", async function() {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();
            tile.dispose();

            geometryLoader!.update(undefined, undefined);

            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not start geometry loading for empty tile", async function() {
            tile.tileLoader!.isFinished = true;
            geometryLoader!.update(undefined, undefined);

            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });
    });

    describe("tile geometry creation", function() {
        it("should not start geometry creation for invisible tile", async function() {
            tile.decodedTile = createFakeDecodedTile();
            tile.isVisible = false;

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;

            expect(spyProcessTechniques.callCount).equal(0);
            expect(spyCreateGeometries.callCount).equal(0);

            geometryLoader!.update(undefined, undefined);

            expect(spyProcessTechniques.callCount).equal(0);
            expect(spyCreateGeometries.callCount).equal(0);

            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not start geometry creation for disposed tile", async function() {
            tile.decodedTile = createFakeDecodedTile();
            tile.dispose();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;

            expect(spyProcessTechniques.callCount).equal(0);
            expect(spyCreateGeometries.callCount).equal(0);

            geometryLoader!.update(undefined, undefined);

            expect(spyProcessTechniques.callCount).equal(0);
            expect(spyCreateGeometries.callCount).equal(0);

            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should start processing geometry for decoded tile only once", async function() {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spySetDecodedTile = sandbox.spy(geometryLoader, "setDecodedTile") as any;
            expect(spyProcessTechniques.callCount).equal(0);
            expect(spySetDecodedTile.callCount).equal(0);

            // Mimic multiple frame updates.
            geometryLoader!.update(undefined, undefined);
            await wait();
            geometryLoader!.update(undefined, undefined);
            await wait();
            geometryLoader!.update(undefined, undefined);
            await wait();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            expect(spySetDecodedTile.callCount).equal(1);
            expect(spyProcessTechniques.callCount).equal(1);

            await willEventually(() => {
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should create geometry for decoded tile only once (via taskqueue)", async function() {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            // Mimic multiple frame updates.
            geometryLoader!.update(undefined, undefined);
            await wait();
            geometryLoader!.update(undefined, undefined);
            await wait();
            geometryLoader!.update(undefined, undefined);
            await wait();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(true);

            await willEventually(() => {
                expect(spyProcessTechniques.callCount).equal(1);
                expect(spyCreateGeometries.callCount).equal(1);
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not create geometry for invisible tile ", async function() {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update(undefined, undefined);
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            tile.isVisible = false;

            //should remove expired task
            mapView.taskQueue.update();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(0);

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(false);

            await willEventually(() => {
                expect(spyProcessTechniques.callCount).equal(1);
                expect(spyCreateGeometries.callCount).equal(0);
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not create geometry for disposed tile while in timeout", async function() {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            geometryLoader!.update(undefined, undefined);
            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(1);

            // Make immediately disposed
            tile.dispose();

            //should remove expired task
            mapView.taskQueue.update();

            expect(mapView.taskQueue.numItemsLeft(TileTaskGroups.CREATE)).equal(0);

            expect(mapView.taskQueue.processNext(TileTaskGroups.CREATE)).equal(false);

            await willEventually(() => {
                expect(spyProcessTechniques.callCount).equal(1);
                expect(spyCreateGeometries.callCount).equal(0);
                expect(geometryLoader.isFinished).to.be.true;
            });
        });
    });
});
