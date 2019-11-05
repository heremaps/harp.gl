/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { hereTilingScheme, mercatorProjection, Projection, TileKey } from "@here/harp-geoutils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { createDefaultClipPlanesEvaluator } from "../lib/ClipPlanesEvaluator";
import { DataSource } from "../lib/DataSource";
import { FrustumIntersection } from "../lib/FrustumIntersection";
import { SimpleTileGeometryManager } from "../lib/geometry/TileGeometryManager";
import { MapView, MapViewDefaults } from "../lib/MapView";
import { Tile } from "../lib/Tile";
import { TileOffsetUtils } from "../lib/Utils";
import { VisibleTileSet } from "../lib/VisibleTileSet";
import { FakeVectorTileDataSource } from "./FakeVectorTileDataSource";

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

class FakeMapView {
    get frameNumber(): number {
        return 0;
    }
    get projection(): Projection {
        return mercatorProjection;
    }
}

class Fixture {
    worldCenter: THREE.Vector3;
    camera: THREE.PerspectiveCamera;
    mapView: MapView;
    tileGeometryManager: SimpleTileGeometryManager;
    ds: DataSource[];
    frustumIntersection: FrustumIntersection;
    vts: VisibleTileSet;

    constructor(params: { tileWrappingEnabled: boolean } = { tileWrappingEnabled: false }) {
        this.worldCenter = new THREE.Vector3();
        this.camera = new THREE.PerspectiveCamera();
        this.ds = [new FakeVectorTileDataSource()];
        this.mapView = new FakeMapView() as MapView;
        (this.mapView as any).camera = this.camera;
        this.tileGeometryManager = new SimpleTileGeometryManager(this.mapView);
        this.ds[0].attach(this.mapView);
        this.frustumIntersection = new FrustumIntersection(
            this.camera,
            this.mapView,
            MapViewDefaults.extendedFrustumCulling,
            params.tileWrappingEnabled
        );
        this.vts = new VisibleTileSet(this.frustumIntersection, this.tileGeometryManager, {
            ...MapViewDefaults,
            clipPlanesEvaluator: createDefaultClipPlanesEvaluator()
        });
    }

    addDataSource(dataSource: DataSource) {
        dataSource.attach(this.mapView);
        this.ds.push(dataSource);
    }
}

describe("VisibleTileSet", function() {
    let fixture: Fixture;

    function setupBerlinCenterCameraFromSamples() {
        fixture.worldCenter.set(21526530.20810355, 26931954.03679565, 0);
        const camera = fixture.camera;
        camera.aspect = 1.7541528239202657;
        camera.far = 4200;
        camera.near = 80;
        camera.fov = 60;
        camera.setRotationFromEuler(new THREE.Euler(0, 0, 0, "XYZ"));
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 800).add(fixture.worldCenter);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);
    }

    // TODO: Update for new interface of updateRenderList
    function updateRenderList(zoomLevel: number, storageLevel: number) {
        const intersectionCount = fixture.vts.updateRenderList(zoomLevel, storageLevel, fixture.ds);
        return { tileList: fixture.vts.dataSourceTileList, intersectionCount };
    }

    beforeEach(function() {
        fixture = new Fixture();
    });

    it("#updateRenderList properly culls Berlin center example view", function() {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506851);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506850);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 0);
    });

    it("#updateRenderList properly culls panorama of Berlin center", function() {
        fixture.worldCenter = new THREE.Vector3(21526192.124894984, 26932362.99119022, 0);
        const camera = fixture.camera;
        camera.aspect = 1.7541528239202657;
        camera.far = 1941.1011265922536;
        camera.near = 34.82202253184507;
        camera.fov = 60;
        camera.setRotationFromEuler(
            new THREE.Euler(0.9524476341218958, 0.3495283765291587, 0.23897332216617775, "XYZ")
        );
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 348.2202253184507).add(fixture.worldCenter);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);
        const zoomLevel = 16;
        const storageLevel = 14;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 5);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506849);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506848);
        assert.equal(visibleTiles[2].tileKey.mortonCode(), 371506850);

        assert.equal(visibleTiles[3].tileKey.mortonCode(), 371506165);
        assert.equal(visibleTiles[4].tileKey.mortonCode(), 371506827);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 0);
    });

    it("#updateRenderList properly finds parent loaded tiles in Berlin center", function() {
        setupBerlinCenterCameraFromSamples();

        const zoomLevel = 15;
        const storageLevel = 14;

        // same as first found code few lines below
        const parentCode = TileKey.parentMortonCode(371506851);
        const parentTileKey = TileKey.fromMortonCode(parentCode);
        const parentKey = TileOffsetUtils.getKeyForTileKeyAndOffset(parentTileKey, 0);

        // fake MapView to think that it has already loaded
        // parent of both found tiles
        const parentTile = fixture.vts.getTile(fixture.ds[0], parentTileKey) as Tile;
        assert.exists(parentTile);
        parentTile.forceHasGeometry(true);

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506851);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506850);

        // some tiles are visible ^^^, but the parent is actually rendered
        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 1);
        assert(renderedTiles.has(parentKey));
        assert.equal(renderedTiles.get(parentKey)!.tileKey.mortonCode(), parentCode);
    });

    it("#markTilesDirty properly handles cached & visible tiles", async function() {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        // fill cache with additional arbitrary not visible tile
        // that shall be disposed() in this test
        const parentTileKey = TileKey.parentMortonCode(371506851);
        const parentTile = fixture.vts.getTile(
            fixture.ds[0],
            TileKey.fromMortonCode(parentTileKey)
        ) as Tile;
        const parentDisposeSpy = sinon.spy(parentTile, "dispose");
        const parentReloadSpy = sinon.spy(parentTile, "load");

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTileDisposeSpies = dataSourceTileList[0].visibleTiles.map(tile =>
            sinon.spy(tile, "dispose")
        );

        const visibleTileReloadSpies = dataSourceTileList[0].visibleTiles.map(tile =>
            sinon.spy(tile, "load")
        );

        fixture.vts.markTilesDirty();

        // only visible should be updated
        assert(visibleTileReloadSpies[0].calledOnce);
        assert(visibleTileReloadSpies[1].calledOnce);
        assert(parentReloadSpy.notCalled);

        // check that dispose was called correctly
        assert(visibleTileDisposeSpies[0].notCalled);
        assert(visibleTileDisposeSpies[1].notCalled);
        assert(parentDisposeSpy.calledOnce);
    });

    it("caches frustum intersection for data sources with same tiling scheme", async function() {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;

        const secondDataSource = new FakeVectorTileDataSource();
        fixture.addDataSource(secondDataSource);

        const intersectionSpy = sinon.spy(fixture.frustumIntersection, "compute");
        {
            // Since the two data sources share same tiling scheme, frustum intersection will be
            // calculated once, and resulting tiles will be the same for the two of them.
            const result = updateRenderList(zoomLevel, storageLevel);
            assert.equal(result.tileList.length, 2);
            expect(result.tileList[0].visibleTiles).to.eql(result.tileList[1].visibleTiles);
            assert(intersectionSpy.calledOnce);
        }

        // If the second data source has a different tile scheme, the intersection must be
        // calculated twice, once for each tiling scheme.
        sinon.replace(secondDataSource, "getTilingScheme", sinon.stub().returns(hereTilingScheme));
        intersectionSpy.resetHistory();

        {
            const result = updateRenderList(zoomLevel, storageLevel);
            assert.equal(result.tileList.length, 2);
            assert(intersectionSpy.calledTwice);
        }
    });

    it("check MapView param tileWrappingEnabled disabled", async function() {
        fixture = new Fixture({ tileWrappingEnabled: false });
        fixture.worldCenter = new THREE.Vector3(0, 0, 0);
        const camera = fixture.camera;
        camera.aspect = 1.7541528239202657;
        camera.far = 19000000;
        camera.near = 34.82202253184507;
        camera.fov = 60;
        camera.setRotationFromEuler(
            new THREE.Euler(0.9524476341218958, 0.3495283765291587, 0.23897332216617775, "XYZ")
        );
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 348.2202253184507).add(fixture.worldCenter);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);

        const zoomLevel = 15;
        const storageLevel = 14;

        const secondDataSource = new FakeVectorTileDataSource();
        fixture.addDataSource(secondDataSource);
        const result = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(result[0].visibleTiles.length, 5);
    });

    it("check MapView param tileWrappingEnabled enabled", async function() {
        fixture = new Fixture({ tileWrappingEnabled: true });
        fixture.worldCenter = new THREE.Vector3(0, 0, 0);
        const camera = fixture.camera;
        camera.aspect = 1.7541528239202657;
        camera.far = 19000000;
        camera.near = 34.82202253184507;
        camera.fov = 60;
        camera.setRotationFromEuler(
            new THREE.Euler(0.9524476341218958, 0.3495283765291587, 0.23897332216617775, "XYZ")
        );
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 348.2202253184507).add(fixture.worldCenter);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);

        const zoomLevel = 15;
        const storageLevel = 14;

        const secondDataSource = new FakeVectorTileDataSource();
        fixture.addDataSource(secondDataSource);
        const result = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(result[0].visibleTiles.length, 16);
    });
});
