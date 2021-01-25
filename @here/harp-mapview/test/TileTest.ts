/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    mercatorProjection,
    OrientedBox3,
    TileKey,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { silenceLoggingAroundFunction } from "@here/harp-test-utils";
import { TaskQueue } from "@here/harp-utils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { DataSource } from "../lib/DataSource";
import { TileGeometryLoader } from "../lib/geometry/TileGeometryLoader";
import { ITileLoader, TileLoaderState } from "../lib/ITileLoader";
import { MapView, TileTaskGroups } from "../lib/MapView";
import { TextElement } from "../lib/text/TextElement";
import { Tile } from "../lib/Tile";

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

    cancel(): void {
        // do nothing.
    }
}
class TileTestStubDataSource extends DataSource {
    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);
        tile.tileLoader = new FakeTileLoader();
        return tile;
    }

    /** @override */
    getTilingScheme() {
        return webMercatorTilingScheme;
    }
}

function createFakeTextElement(): TextElement {
    const priority = 0;
    return new TextElement("fake", new THREE.Vector3(), {}, {}, priority);
}
describe("Tile", function () {
    const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
    let stubDataSource: any;
    let mapView: any;
    let sandbox: any;

    before(function () {
        sandbox = sinon.createSandbox();
    });

    beforeEach(function () {
        stubDataSource = new TileTestStubDataSource({ name: "test-data-source" });
        mapView = {
            taskQueue: new TaskQueue({
                groups: [TileTaskGroups.CREATE, TileTaskGroups.FETCH_AND_DECODE]
            }),
            projection: mercatorProjection,
            frameNumber: 1,
            visibleTileSet: { disposeTile: () => {} } as any
        } as MapView;
        stubDataSource.attach(mapView);
    });

    afterEach(function () {
        sandbox.restore();
    });

    it("set empty decoded tile forces hasGeometry to be true", function () {
        const tile = new Tile(stubDataSource, tileKey);
        const decodedTile: DecodedTile = {
            techniques: [],
            geometries: []
        };
        tile.decodedTile = decodedTile;
        assert(tile.hasGeometry);
        expect(tile.decodedTile).to.be.equal(decodedTile);
    });
    it("set decoded tile with text only forces hasGeometry to be true", function () {
        const tile = new Tile(stubDataSource, tileKey);
        const decodedTile: DecodedTile = {
            techniques: [],
            geometries: [],
            textGeometries: [
                {
                    positions: {
                        name: "positions",
                        buffer: new Float32Array(),
                        type: "float",
                        itemCount: 1000
                    },
                    texts: new Array<number>(1000),
                    stringCatalog: new Array<undefined>(1000)
                }
            ]
        };
        tile.decodedTile = decodedTile;
        assert(tile.hasGeometry);
        expect(tile.decodedTile).to.be.equal(decodedTile);
    });

    describe("Text elements", function () {
        it("addTextElement to changed tile does not recreate text group", function () {
            const tile = new Tile(stubDataSource, tileKey);
            tile.addTextElement(createFakeTextElement());

            const oldGroup = tile.textElementGroups.groups.values().next().value;
            expect(oldGroup.elements).to.have.lengthOf(1);

            tile.addTextElement(createFakeTextElement());
            const newGroup = tile.textElementGroups.groups.values().next().value;
            expect(newGroup.elements).to.have.lengthOf(2);
            expect(newGroup).to.equal(oldGroup);
        });

        it("addTextElement to unchanged tile recreates text group", function () {
            const tile = new Tile(stubDataSource, tileKey);
            tile.addTextElement(createFakeTextElement());
            tile.textElementsChanged = false;

            const oldGroup = tile.textElementGroups.groups.values().next().value;
            expect(oldGroup.elements).to.have.lengthOf(1);

            tile.addTextElement(createFakeTextElement());
            const newGroup = tile.textElementGroups.groups.values().next().value;
            expect(newGroup.elements).to.have.lengthOf(2);
            expect(newGroup).to.not.equal(oldGroup);
            assert.isTrue(tile.textElementsChanged);
        });

        it("removeTextElement from changed tile does not recreate text group", function () {
            const tile = new Tile(stubDataSource, tileKey);
            tile.addTextElement(createFakeTextElement());
            const textElement = createFakeTextElement();
            tile.addTextElement(textElement);

            const oldGroup = tile.textElementGroups.groups.values().next().value;
            expect(oldGroup.elements).to.have.lengthOf(2);

            const result = tile.removeTextElement(textElement);
            assert.isTrue(result);

            const newGroup = tile.textElementGroups.groups.values().next().value;
            expect(newGroup.elements).to.have.lengthOf(1);
            expect(newGroup).to.equal(oldGroup);
        });

        it("removeTextElement from unchanged tile recreates text group", function () {
            const tile = new Tile(stubDataSource, tileKey);
            tile.addTextElement(createFakeTextElement());
            const textElement = createFakeTextElement();
            tile.addTextElement(textElement);
            tile.textElementsChanged = false;

            const oldGroup = tile.textElementGroups.groups.values().next().value;
            const result = tile.removeTextElement(textElement);
            assert.isTrue(result);

            const newGroup = tile.textElementGroups.groups.values().next().value;
            expect(newGroup.elements).to.have.lengthOf(1);
            expect(newGroup).to.not.equal(oldGroup);
            assert.isTrue(tile.textElementsChanged);
        });

        it("clearTextElements from empty tile does nothing", function () {
            const tile = new Tile(stubDataSource, tileKey);
            assert.isFalse(tile.textElementsChanged);

            tile.clearTextElements();
            assert.isFalse(tile.textElementsChanged);

            const textElement = createFakeTextElement();
            tile.addTextElement(textElement);
            tile.removeTextElement(textElement);
            tile.clearTextElements();
            assert.isTrue(tile.textElementsChanged);
        });

        it("clearTextElements from non-empty tile marks it as changed", function () {
            const tile = new Tile(stubDataSource, tileKey);
            tile.addTextElement(createFakeTextElement());
            expect(tile.textElementGroups.count()).to.equal(1);
            tile.textElementsChanged = false;

            tile.clearTextElements();
            expect(tile.textElementGroups.count()).to.equal(0);
            assert.isTrue(tile.textElementsChanged);
        });

        it("dispose diposes of text elements", function () {
            const tile = new Tile(stubDataSource, tileKey);
            const textElement = createFakeTextElement();
            const disposeStub = sinon.stub(textElement, "dispose");
            tile.addTextElement(textElement);
            expect(tile.textElementGroups.count()).to.equal(1);

            tile.dispose();

            disposeStub.called;
            expect(tile.textElementGroups.count()).to.equal(0);
        });
    });

    it("setting skipping will cause willRender to return false", function () {
        const tile = new Tile(stubDataSource, tileKey);
        tile.skipRendering = true;
        expect(tile.willRender(0)).is.false;
        tile.skipRendering = false;
        expect(tile.willRender(0)).is.true;
    });

    describe("Elevation", function () {
        it("default tile min/max elevation and max geometry height are 0", function () {
            const tile = new Tile(stubDataSource, tileKey);
            const oldGeoBox = tile.geoBox.clone();
            const oldBBox = tile.boundingBox.clone();

            tile.decodedTile = { techniques: [], geometries: [] };

            expect(tile.geoBox).deep.equals(oldGeoBox);
            expect(tile.boundingBox).deep.equals(oldBBox);
        });

        it("elevationRange setter does not elevate bbox if maxGeometryHeight is not set", function () {
            const tile = new Tile(stubDataSource, tileKey);
            const oldBBox = tile.boundingBox.clone();

            tile.elevationRange = { minElevation: 5, maxElevation: 10 };

            expect(tile.geoBox.minAltitude).equals(tile.elevationRange.minElevation);
            expect(tile.geoBox.maxAltitude).equals(tile.elevationRange.maxElevation);
            expect(tile.boundingBox).deep.equals(oldBBox);

            tile.decodedTile = { techniques: [], geometries: [], boundingBox: new OrientedBox3() };

            tile.elevationRange = { minElevation: 100, maxElevation: 500 };
            expect(tile.boundingBox).deep.equals(tile.decodedTile.boundingBox);
        });

        it("elevationRange setter elevates bbox if maxGeometryHeight is set", function () {
            const tile = new Tile(stubDataSource, tileKey);
            const minElevation = 30;
            const maxElevation = 50;
            const maxGeometryHeight = 100;
            const expectedGeoBox = tile.geoBox.clone();
            expectedGeoBox.southWest.altitude = minElevation;
            expectedGeoBox.northEast.altitude = maxElevation + maxGeometryHeight;
            const expectedBBox = new OrientedBox3();
            stubDataSource.mapView.projection.projectBox(expectedGeoBox, expectedBBox);

            tile.decodedTile = { techniques: [], geometries: [], maxGeometryHeight };
            tile.elevationRange = { minElevation, maxElevation };

            expect(tile.geoBox).deep.equals(expectedGeoBox);
            expect(tile.boundingBox).deep.equals(expectedBBox);
        });

        it("elevationRange setter elevates bbox if minGeometryHeight is set", function () {
            const tile = new Tile(stubDataSource, tileKey);
            const minElevation = 30;
            const maxElevation = 50;
            const minGeometryHeight = -100;
            const expectedGeoBox = tile.geoBox.clone();
            expectedGeoBox.southWest.altitude = minElevation + minGeometryHeight;
            expectedGeoBox.northEast.altitude = maxElevation;
            const expectedBBox = new OrientedBox3();
            stubDataSource.mapView.projection.projectBox(expectedGeoBox, expectedBBox);

            tile.decodedTile = { techniques: [], geometries: [], minGeometryHeight };
            tile.elevationRange = { minElevation, maxElevation };

            expect(tile.geoBox).deep.equals(expectedGeoBox);
            expect(tile.boundingBox).deep.equals(expectedBBox);
        });

        it("decodedTile setter sets decoded tile bbox if defined but does not elevate it", function () {
            const key = new TileKey(5, 5, 5);
            const tile = new Tile(stubDataSource, key);
            const expectedGeoBox = tile.dataSource.getTilingScheme().getGeoBox(key);
            expectedGeoBox.southWest.altitude = 500;
            expectedGeoBox.northEast.altitude = 1000;
            const expectedBBox = new OrientedBox3(
                new THREE.Vector3(1, 2, 3),
                new THREE.Matrix4(),
                new THREE.Vector3(1, 1, 1)
            );

            tile.elevationRange = { minElevation: 500, maxElevation: 1000 };
            tile.decodedTile = {
                techniques: [],
                geometries: [],
                boundingBox: expectedBBox,
                maxGeometryHeight: 10
            };

            expect(tile.geoBox).deep.equals(expectedGeoBox);
            expect(tile.boundingBox).deep.equals(expectedBBox);
        });

        it("decodedTile setter elevates bbox with decoded maxGeometryHeight if defined", function () {
            const tile = new Tile(stubDataSource, tileKey);
            const minElevation = 500;
            const maxElevation = 1000;
            const maxGeometryHeight = 10;
            const expectedGeoBox = tile.geoBox.clone();
            expectedGeoBox.southWest.altitude = minElevation;
            expectedGeoBox.northEast.altitude = maxElevation + maxGeometryHeight;
            const expectedBBox = new OrientedBox3();
            stubDataSource.mapView.projection.projectBox(expectedGeoBox, expectedBBox);

            tile.elevationRange = { minElevation, maxElevation };
            tile.decodedTile = { techniques: [], geometries: [], maxGeometryHeight };

            expect(tile.geoBox).deep.equals(expectedGeoBox);
            expect(tile.boundingBox).deep.equals(expectedBBox);
        });
    });

    describe("isVisible", function () {
        it("doesn't throw on isVisible if not attached to a MapView", function () {
            const tile = new Tile(stubDataSource, tileKey);
            mapView.frameNumber = 2;
            tile.frameNumLastRequested = 2;
            expect(tile.isVisible).not.throw;
            expect(tile.isVisible).is.true;
            stubDataSource.detach(mapView as MapView);
            silenceLoggingAroundFunction("Tile", () => {
                expect(tile.isVisible).not.throw;
                expect(tile.isVisible).is.false;
            });
        });

        it("cancels geometry loader if tile is made invisible", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader = (tile as any).m_tileGeometryLoader;
            const cancelSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "cancel");

            tile.isVisible = false;

            expect(cancelSpy.called).be.true;
        });

        it("does not cancel geometry loader if tile is made visible", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader = (tile as any).m_tileGeometryLoader;
            const cancelSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "cancel");

            tile.isVisible = true;

            expect(cancelSpy.called).be.false;
        });
    });

    describe("updateGeometry", function () {
        it("returns false immediately if tile does not use geometry loader", function () {
            stubDataSource.useGeometryLoader = false;
            const tile = stubDataSource.getTile(tileKey);
            expect(tile.updateGeometry()).be.false;
        });

        it("does not update geometry loader if tile loader is not done", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader = (tile as any).m_tileGeometryLoader;
            (tile.tileLoader as FakeTileLoader).isFinished = false;
            const updateSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "update");

            expect(tile.updateGeometry()).be.true;
            expect(updateSpy.called).be.false;
        });

        it("finishes geometry loader if decoded tile is empty", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader: TileGeometryLoader = (tile as any).m_tileGeometryLoader;
            (tile.tileLoader as FakeTileLoader).isFinished = true;
            const updateSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "update");

            expect(tile.updateGeometry()).be.true;
            expect(updateSpy.called).be.false;
            expect(geometryLoader.isFinished).be.true;
        });

        it("does not update geometry loader if it's canceled", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader: TileGeometryLoader = (tile as any).m_tileGeometryLoader;
            geometryLoader.cancel();
            (tile.tileLoader as FakeTileLoader).isFinished = true;
            tile.decodedTile = { techniques: [], geometries: [] };
            const updateSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "update");

            expect(tile.updateGeometry()).be.true;
            expect(updateSpy.called).be.false;
        });

        it("cancels geometry loader if data source is detached from map view", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader: TileGeometryLoader = (tile as any).m_tileGeometryLoader;
            (tile.tileLoader as FakeTileLoader).isFinished = true;
            tile.decodedTile = { techniques: [], geometries: [] };
            stubDataSource.detach(mapView);
            const updateSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "update");
            const cancelSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "cancel");

            expect(tile.updateGeometry()).be.true;
            expect(updateSpy.called).be.false;
            expect(cancelSpy.called).be.true;
        });

        it("does not update geometry loader for disposed tile", function () {
            stubDataSource.useGeometryLoader = true;
            const tile = stubDataSource.getTile(tileKey);
            const geometryLoader = (tile as any).m_tileGeometryLoader;
            (tile.tileLoader as FakeTileLoader).isFinished = true;
            tile.dispose();
            const updateSpy: sinon.SinonSpy = sandbox.spy(geometryLoader, "update");

            expect(tile.updateGeometry()).be.true;
            expect(updateSpy.called).be.false;
        });
    });
});
