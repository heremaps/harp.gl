/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { TileKey } from "@here/harp-geoutils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { MapView, MapViewDefaults } from "../lib/MapView";
import { Tile } from "../lib/Tile";
import { VisibleTileSet } from "../lib/VisibleTileSet";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

function createBerlinCenterCameraFromSamples() {
    const worldCenter = new THREE.Vector3(21526530.20810355, 26931954.03679565, 0);
    const camera = new THREE.PerspectiveCamera();
    camera.aspect = 1.7541528239202657;
    camera.far = 4200;
    camera.near = 80;
    camera.fov = 60;
    camera.setRotationFromEuler(new THREE.Euler(0, 0, 0, "XYZ"));
    camera.scale.set(1, 1, 1);
    camera.position.set(0, 0, 800);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(false);
    return { camera, worldCenter };
}

class FakeMapView {
    get frameNumber(): number {
        return 0;
    }
}

describe("VisibleTileSet", function() {
    it("#updateRenderList properly culls Berlin center example view", function() {
        const { camera, worldCenter } = createBerlinCenterCameraFromSamples();
        const vts = new VisibleTileSet(camera, MapViewDefaults);
        const zoomLevel = 15;
        const storageLevel = 14;
        const ds = new FakeOmvDataSource();

        ds.attach(new FakeMapView() as MapView);

        vts.updateRenderList(worldCenter, zoomLevel, storageLevel, [ds]);
        const dataSourceTileList = vts.dataSourceTileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506851);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506850);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.length, 0);
    });

    it("#updateRenderList properly culls panorama of Berlin center", function() {
        const worldCenter = new THREE.Vector3(21526192.124894984, 26932362.99119022, 0);
        const camera = new THREE.PerspectiveCamera();
        camera.aspect = 1.7541528239202657;
        camera.far = 1941.1011265922536;
        camera.near = 34.82202253184507;
        camera.fov = 60;
        camera.setRotationFromEuler(
            new THREE.Euler(0.9524476341218958, 0.3495283765291587, 0.23897332216617775, "XYZ")
        );
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 348.2202253184507);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);

        const vts = new VisibleTileSet(camera, MapViewDefaults);
        const zoomLevel = 16;
        const storageLevel = 14;
        const ds = new FakeOmvDataSource();

        ds.attach(new FakeMapView() as MapView);

        vts.updateRenderList(worldCenter, zoomLevel, storageLevel, [ds]);
        const dataSourceTileList = vts.dataSourceTileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 5);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506849);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506848);
        assert.equal(visibleTiles[2].tileKey.mortonCode(), 371506850);

        assert.equal(visibleTiles[3].tileKey.mortonCode(), 371506165);
        assert.equal(visibleTiles[4].tileKey.mortonCode(), 371506827);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.length, 0);
    });

    it("#updateRenderList properly finds parent loaded tiles in Berlin center", function() {
        const { camera, worldCenter } = createBerlinCenterCameraFromSamples();
        const vts = new VisibleTileSet(camera, MapViewDefaults);

        const zoomLevel = 15;
        const storageLevel = 14;
        const dataSource = new FakeOmvDataSource();

        dataSource.attach(new FakeMapView() as MapView);

        // same as first found code few lines below
        const parentCode = TileKey.parentMortonCode(371506851);

        // fake MapView to think that it has already loaded
        // parent of both found tiles
        const parentTile = vts.getTile(dataSource, TileKey.fromMortonCode(parentCode)) as Tile;
        assert.exists(parentTile);
        parentTile.forceHasGeometry(true);

        vts.updateRenderList(worldCenter, zoomLevel, storageLevel, [dataSource]);
        const dataSourceTileList = vts.dataSourceTileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506851);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506850);

        // some tiles are visible ^^^, but the parent is actually rendered
        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.length, 1);
        assert.equal(renderedTiles[0].tileKey.mortonCode(), parentCode);
    });

    it("#markTilesDirty properly handles cached & visible tiles", async function() {
        const { camera, worldCenter } = createBerlinCenterCameraFromSamples();
        const vts = new VisibleTileSet(camera, MapViewDefaults);
        const zoomLevel = 15;
        const storageLevel = 14;
        const ds = new FakeOmvDataSource();

        ds.attach(new FakeMapView() as MapView);

        vts.updateRenderList(worldCenter, zoomLevel, storageLevel, [ds]);
        const dataSourceTileList = vts.dataSourceTileList;

        // fill cache with additional arbitrary not visible tile
        // that shall be disposed() in this test
        const parentTileKey = TileKey.parentMortonCode(371506851);
        const parentTile = vts.getTile(ds, TileKey.fromMortonCode(parentTileKey)) as Tile;
        const parentDisposeSpy = sinon.spy(parentTile, "dispose");
        const parentReloadSpy = sinon.spy(parentTile, "reload");

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTileDisposeSpies = dataSourceTileList[0].visibleTiles.map(tile =>
            sinon.spy(tile, "dispose")
        );

        const visibleTileReloadSpies = dataSourceTileList[0].visibleTiles.map(tile =>
            sinon.spy(tile, "reload")
        );

        vts.markTilesDirty();

        // only visible should be updated
        assert(visibleTileReloadSpies[0].calledOnce);
        assert(visibleTileReloadSpies[1].calledOnce);
        assert(parentReloadSpy.notCalled);

        // check that dispose was called correctly
        assert(visibleTileDisposeSpies[0].notCalled);
        assert(visibleTileDisposeSpies[1].notCalled);
        assert(parentDisposeSpy.calledOnce);
    });
});
