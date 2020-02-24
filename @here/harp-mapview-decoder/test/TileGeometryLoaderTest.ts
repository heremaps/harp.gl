/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    TileKey,
    TilingScheme,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { DataSource, MapView, Statistics, Tile } from "@here/harp-mapview";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
chai.use(chaiAsPromised);
const { expect } = chai;
import { TileGeometryCreator } from "@here/harp-mapview/lib/geometry/TileGeometryCreator";
import { SimpleTileGeometryLoader } from "@here/harp-mapview/lib/geometry/TileGeometryLoader";
import { willEventually } from "@here/harp-test-utils";
import * as sinon from "sinon";

class FakeVisibleTileSet {
    // tslint:disable-next-line: no-empty
    disposeTile(tile: Tile) {}
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
        return tile;
    }
}

function createFakeMapView() {
    return ({
        projection: webMercatorProjection,
        // tslint:disable-next-line:no-empty
        getDataSourceByName() {},
        statistics: new Statistics(),
        frameNumber: 5, // must be higher then 0, for tile visibility check
        visibleTileSet: new FakeVisibleTileSet(),
        theme: {}
    } as any) as MapView;
}

function createFakeDecodedTile(): DecodedTile {
    return {
        techniques: [],
        geometries: []
    };
}

const wait = (ms: number = 0) => new Promise(res => setTimeout(res, ms));

describe("SimpleTileGeometryLoader", function() {
    let tileKey: TileKey;
    let tile: Tile;
    let dataSource: DataSource;
    let mapView: MapView;
    let geometryLoader: SimpleTileGeometryLoader;
    let sandbox: any;

    before(function() {
        tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        mapView = createFakeMapView();
        dataSource = new MockDataSource();
        dataSource.attach(mapView);
    });

    beforeEach(function() {
        tile = dataSource.getTile(tileKey)!;
        geometryLoader = new SimpleTileGeometryLoader(tile);
        tile.tileGeometryLoader = geometryLoader;
        sandbox = sinon.createSandbox();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe("tile preprocessing", function() {
        it("should not load geometry before update", function() {
            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.basicGeometryLoaded).to.be.false;

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.allGeometryLoaded).to.be.false;

            // tslint:disable-next-line: no-unused-expression
            return expect(geometryLoader.isFinished).to.be.false;
        });

        it("should not load geometry before tile is decoded", function() {
            geometryLoader.update(undefined, undefined);
            geometryLoader.update(undefined, undefined);

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.geometryCreationPending).to.be.false;

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.basicGeometryLoaded).to.be.false;

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.allGeometryLoaded).to.be.false;

            // tslint:disable-next-line: no-unused-expression
            return expect(geometryLoader.isFinished).to.be.false;
        });

        it("should start load geometry for decoded tile", async function() {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.isFinished).to.be.false;

            geometryLoader!.update(undefined, undefined);

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.geometryCreationPending).to.be.true;

            await willEventually(() => {
                // tslint:disable-next-line: no-unused-expression
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not start geometry loading for invisible tile", async function() {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();
            tile.isVisible = false;

            geometryLoader!.update(undefined, undefined);

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                // tslint:disable-next-line: no-unused-expression
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not start geometry loading for disposed tile", async function() {
            // Mimic the tile is being decoded.
            tile.decodedTile = createFakeDecodedTile();
            tile.dispose();

            geometryLoader!.update(undefined, undefined);

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                // tslint:disable-next-line: no-unused-expression
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

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                // tslint:disable-next-line: no-unused-expression
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

            // tslint:disable-next-line: no-unused-expression
            expect(geometryLoader.geometryCreationPending).to.be.false;

            await willEventually(() => {
                // tslint:disable-next-line: no-unused-expression
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

            expect(spySetDecodedTile.callCount).equal(1);
            expect(spyProcessTechniques.callCount).equal(1);

            await willEventually(() => {
                // tslint:disable-next-line: no-unused-expression
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should create geometry for decoded tile only once (via timeout)", async function() {
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

            await willEventually(() => {
                expect(spyProcessTechniques.callCount).equal(1);
                expect(spyCreateGeometries.callCount).equal(1);
                // tslint:disable-next-line: no-unused-expression
                expect(geometryLoader.isFinished).to.be.true;
            });
        });

        it("should not create geometry for invisible tile while in timeout", async function() {
            tile.decodedTile = createFakeDecodedTile();

            const geometryCreator = TileGeometryCreator.instance;
            const spyProcessTechniques = sandbox.spy(geometryCreator, "processTechniques") as any;
            const spyCreateGeometries = sandbox.spy(geometryCreator, "createAllGeometries") as any;
            expect(spyCreateGeometries.callCount).equal(0);
            expect(spyProcessTechniques.callCount).equal(0);

            // Mimic multiple frame updates.
            geometryLoader!.update(undefined, undefined);
            // Make immediately invisible - if flaky remove this test.
            tile.isVisible = false;
            await wait();

            await willEventually(() => {
                expect(spyProcessTechniques.callCount).equal(1);
                expect(spyCreateGeometries.callCount).equal(0);
                // tslint:disable-next-line: no-unused-expression
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
            // Make immediately disposed - if flaky remove this test.
            tile.dispose();

            await willEventually(() => {
                expect(spyProcessTechniques.callCount).equal(1);
                expect(spyCreateGeometries.callCount).equal(0);
                // tslint:disable-next-line: no-unused-expression
                expect(geometryLoader.isFinished).to.be.true;
            });
        });
    });
});
