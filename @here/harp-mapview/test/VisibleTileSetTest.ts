/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { DecodedTile } from "@here/harp-datasource-protocol";
import {
    hereTilingScheme,
    mercatorProjection,
    mercatorTilingScheme,
    Projection,
    sphereProjection,
    TileKey,
    TilingScheme,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { getOptionValue, TaskQueue } from "@here/harp-utils";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { BackgroundDataSource } from "../lib/BackgroundDataSource";
import { createDefaultClipPlanesEvaluator } from "../lib/ClipPlanesEvaluator";
import { DataSource, DataSourceOptions } from "../lib/DataSource";
import { FrustumIntersection, TileKeyEntry } from "../lib/FrustumIntersection";
import { TileGeometryCreator } from "../lib/geometry/TileGeometryCreator";
import { TileGeometryManager } from "../lib/geometry/TileGeometryManager";
import { MapView, TileTaskGroups } from "../lib/MapView";
import { Tile } from "../lib/Tile";
import { TileOffsetUtils } from "../lib/Utils";
import {
    DataSourceTileList,
    ResourceComputationType,
    VisibleTileSet,
    VisibleTileSetOptions
} from "../lib/VisibleTileSet";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

class FakeMapView {
    taskQueue = new TaskQueue({
        groups: [TileTaskGroups.CREATE, TileTaskGroups.FETCH_AND_DECODE]
    });

    constructor(readonly projection: Projection) {}

    get frameNumber(): number {
        return 0;
    }

    get focalLength(): number {
        // fov: 60
        // height: 1080 px
        // 1080 * 0.5 * Math.tan(THREE.MathUtils.degToRad(60) * 0.5)
        return 935.307436087;
    }

    get clearColor(): number {
        return 0;
    }
}

interface FixtureOptions {
    tileWrappingEnabled?: boolean;
    enableMixedLod?: boolean;
    projection?: Projection;
    quadTreeSearchDistanceUp?: number;
    quadTreeSearchDistanceDown?: number;
}

class Fixture {
    worldCenter: THREE.Vector3;
    camera: THREE.PerspectiveCamera;
    mapView: MapView;
    tileGeometryManager: TileGeometryManager;
    ds: DataSource[];
    frustumIntersection: FrustumIntersection;
    vts: VisibleTileSet;

    constructor(
        params: FixtureOptions = {},
        datasourceOptions: DataSourceOptions = { name: "omv" }
    ) {
        this.worldCenter = new THREE.Vector3();
        this.camera = new THREE.PerspectiveCamera();
        this.ds = [new FakeOmvDataSource(datasourceOptions)];
        this.mapView = new FakeMapView(
            getOptionValue(params.projection, mercatorProjection)
        ) as MapView;
        (this.mapView as any).camera = this.camera;
        this.tileGeometryManager = new TileGeometryManager(this.mapView);
        this.ds[0].attach(this.mapView);
        this.frustumIntersection = new FrustumIntersection(
            this.camera,
            this.mapView,
            true,
            getOptionValue(params.tileWrappingEnabled, false),
            getOptionValue(params.enableMixedLod, false)
        );

        const vtsOptions: VisibleTileSetOptions = {
            projection: getOptionValue(params.projection, mercatorProjection),
            clipPlanesEvaluator: createDefaultClipPlanesEvaluator(),
            maxVisibleDataSourceTiles: 100,
            extendedFrustumCulling: true,
            tileCacheSize: 200,
            resourceComputationType: ResourceComputationType.EstimationInMb,
            quadTreeSearchDistanceUp: params.quadTreeSearchDistanceUp ?? 3,
            quadTreeSearchDistanceDown: params.quadTreeSearchDistanceDown ?? 2,
            maxTilesPerFrame: 0
        };
        this.vts = new VisibleTileSet(
            this.frustumIntersection,
            this.tileGeometryManager,
            vtsOptions,
            this.mapView.taskQueue
        );
    }

    addDataSource(dataSource: DataSource) {
        dataSource.attach(this.mapView);
        this.ds.push(dataSource);
    }

    removeDataSource(dataSource: DataSource) {
        dataSource.detach(this.mapView);
        const index = this.ds.indexOf(dataSource, 0);
        if (index >= 0) {
            this.ds.splice(index, 1);
        }
    }
}

describe("VisibleTileSet", function () {
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
        const frameNumber = 42;
        const intersectionCount = fixture.vts.updateRenderList(
            zoomLevel,
            storageLevel,
            fixture.ds,
            frameNumber
        );
        return {
            tileList: fixture.vts.dataSourceTileList,
            intersectionCount
        };
    }

    /**
     * Fake {@link DataSource} which provides tiles with the ground plane geometry.
     */
    class FakeCoveringTileWMTS extends DataSource {
        /**
         * Construct a fake {@link DataSource}.
         * @param isFullyCovering - If this {@link DataSource} should be fully covering.
         */
        constructor(isFullyCovering?: boolean) {
            super();
            this.addGroundPlane = isFullyCovering ?? true;
            this.cacheable = true;
        }

        /** @override */
        getTilingScheme(): TilingScheme {
            return webMercatorTilingScheme;
        }

        /** @override */
        getTile(tileKey: TileKey): Tile | undefined {
            const tile = new Tile(this, tileKey);
            const decodedTile: DecodedTile = {
                techniques: [],
                geometries: []
            };
            TileGeometryCreator.instance.createAllGeometries(tile, decodedTile);
            return tile;
        }
    }

    /**
     * Fake {@link DataSource} with no backgroundPlane geometry, but which registers
     * that it is fully covering, because its geometry fully covers the {@link Tile}, an example
     * is satellite data or terrain.
     */
    class FakeWebTile extends DataSource {
        constructor(private readonly tilingScheme?: TilingScheme) {
            super();
        }

        /** @override */
        getTilingScheme(): TilingScheme {
            return this.tilingScheme ?? webMercatorTilingScheme;
        }

        /** @override */
        getTile(tileKey: TileKey): Tile | undefined {
            const tile = new Tile(this, tileKey);
            tile.forceHasGeometry(true);
            return tile;
        }

        /** @override */
        isFullyCovering(): boolean {
            return true;
        }
    }

    // Needed for chai expect.

    const compareDataSources = (
        dstl: DataSourceTileList[],
        dsSkipped: DataSource[],
        dsValid: DataSource[]
    ) => {
        dstl.forEach(dataSourceTileList => {
            if (dsSkipped.includes(dataSourceTileList.dataSource)) {
                dataSourceTileList.visibleTiles.forEach(tile => {
                    expect(tile["skipRendering"]).is.true;
                });
            } else if (dsValid.includes(dataSourceTileList.dataSource)) {
                dataSourceTileList.visibleTiles.forEach(tile => {
                    expect(tile["skipRendering"]).is.false;
                });
            }
        });
    };

    beforeEach(function () {
        fixture = new Fixture();
    });

    it("#updateRenderList properly culls Berlin center example view", function () {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506850);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506851);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 0);
    });

    it("dependencies of tiles are added to visible tile set", function () {
        const tileKey1 = TileKey.fromMortonCode(371506850);
        const tileKey2 = TileKey.fromMortonCode(371506851);

        // Test where we have 2 actually visible tiles (in the sense that they are in the frustum,
        // see visibleTileKeys below) and one visible tile because it is a dependency.
        fixture.vts["getVisibleTileKeysForDataSources"] = sinon.stub().returns({
            tileKeys: [
                {
                    dataSource: fixture.ds[0],
                    visibleTileKeys: [new TileKeyEntry(tileKey1, 0), new TileKeyEntry(tileKey2, 0)]
                }
            ],
            allBoundingBoxesFinal: true
        });

        // Adding the dependency to make sure it is visible
        const dataSource = fixture.ds[0];
        const tile1 = fixture.vts.getTile(dataSource, tileKey1, 0, 0);
        assert.notEqual(tile1, undefined);
        const tileKey3 = TileKey.fromMortonCode(371506852);
        tile1!.dependencies.push(tileKey3);

        const zoomLevel = 15;
        const storageLevel = 14;

        const dataSourceTileList_1 = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList_1.length, 1);
        assert.equal(dataSourceTileList_1[0].visibleTiles.length, 3);

        const tile3 = fixture.vts.getCachedTile(dataSource, tileKey3, 0, 0);
        assert.notEqual(tile3, undefined);
        const tileKey4 = TileKey.fromMortonCode(371506853);
        tile3!.dependencies.push(tileKey4);

        const dataSourceTileList_2 = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(dataSourceTileList_2.length, 1);
        // Ensure that the fourth tile isn't `visible`.
        assert.equal(dataSourceTileList_2[0].visibleTiles.length, 3);

        const visibleTiles = dataSourceTileList_2[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), tileKey1.mortonCode());
        assert.equal(visibleTiles[1].tileKey.mortonCode(), tileKey2.mortonCode());
        assert.equal(visibleTiles[2].tileKey.mortonCode(), tileKey3.mortonCode());

        // Check that the dependent tile exists in the cache.
        assert.notEqual(fixture.vts.getCachedTile(dataSource, tileKey3, 0, 0), undefined);

        const renderedTiles = dataSourceTileList_2[0].renderedTiles;
        assert.equal(renderedTiles.size, 0);
    });

    it("#no fallback doesn't put loading tiles in renderedTiles", function () {
        fixture = new Fixture({ quadTreeSearchDistanceDown: 0, quadTreeSearchDistanceUp: 0 });
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506850);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506851);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 0);
    });

    it("#updateRenderList properly culls panorama of Berlin center", function () {
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
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506850);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506849);
        assert.equal(visibleTiles[2].tileKey.mortonCode(), 371506848);
        assert.equal(visibleTiles[3].tileKey.mortonCode(), 371506165);
        assert.equal(visibleTiles[4].tileKey.mortonCode(), 371506827);

        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 0);
    });

    it("#updateRenderList properly finds parent loaded tiles in Berlin center", function () {
        setupBerlinCenterCameraFromSamples();

        const zoomLevel = 15;
        const storageLevel = 14;
        const offset = 0;
        const frameNumber = 42;

        // same as first found code few lines below
        const parentCode = TileKey.parentMortonCode(371506851);
        const parentTileKey = TileKey.fromMortonCode(parentCode);
        const parentKey = TileOffsetUtils.getKeyForTileKeyAndOffset(parentTileKey, 0);

        // fake MapView to think that it has already loaded
        // parent of both found tiles
        const parentTile = fixture.vts.getTile(
            fixture.ds[0],
            parentTileKey,
            offset,
            frameNumber
        ) as Tile;
        assert.exists(parentTile);
        parentTile.forceHasGeometry(true);

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 2);

        const visibleTiles = dataSourceTileList[0].visibleTiles;
        assert.equal(visibleTiles[0].tileKey.mortonCode(), 371506850);
        assert.equal(visibleTiles[1].tileKey.mortonCode(), 371506851);

        // some tiles are visible ^^^, but the parent is actually rendered
        const renderedTiles = dataSourceTileList[0].renderedTiles;
        assert.equal(renderedTiles.size, 1);
        assert(renderedTiles.has(parentKey));
        assert.equal(renderedTiles.get(parentKey)!.tileKey.mortonCode(), parentCode);
    });

    it("#updateRenderList properly filters root tiles", function () {
        fixture = new Fixture(
            { tileWrappingEnabled: true },
            {
                name: "omv",
                minDataLevel: 0,
                maxDataLevel: 0
            }
        );
        setupBerlinCenterCameraFromSamples();

        const zoomLevel = 10;
        const storageLevel = 0;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(dataSourceTileList.length, 1);
        assert.equal(dataSourceTileList[0].visibleTiles.length, 1);
        assert.equal(dataSourceTileList[0]?.visibleTiles[0].tileKey.mortonCode(), 1);
    });

    it("#markTilesDirty properly handles cached & visible tiles", async function () {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;
        const offset = 0;
        const frameNumber = 42;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        // fill cache with additional arbitrary not visible tile
        // that shall be disposed() in this test
        const parentTileKey = TileKey.parentMortonCode(371506851);
        const parentTile = fixture.vts.getTile(
            fixture.ds[0],
            TileKey.fromMortonCode(parentTileKey),
            offset,
            frameNumber
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
        fixture.mapView.taskQueue.processNext(TileTaskGroups.FETCH_AND_DECODE, undefined, 2);

        // only visible should be updated
        assert(visibleTileReloadSpies[0].calledOnce);
        assert(visibleTileReloadSpies[1].calledOnce);
        assert(parentReloadSpy.notCalled);

        // check that dispose was called correctly
        assert(visibleTileDisposeSpies[0].notCalled);
        assert(visibleTileDisposeSpies[1].notCalled);
        assert(parentDisposeSpy.calledOnce);
    });

    it("#markTilesDirty properly uses passed filter", async function () {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;
        const offset = 0;
        const frameNumber = 42;

        const dataSourceTileList = updateRenderList(zoomLevel, storageLevel).tileList;

        // fill cache with additional arbitrary not visible tile
        // that shall be disposed() in this test
        const parentTileKey = TileKey.parentMortonCode(371506851);
        const parentTile = fixture.vts.getTile(
            fixture.ds[0],
            TileKey.fromMortonCode(parentTileKey),
            offset,
            frameNumber
        ) as Tile;
        const parentDisposeSpy = sinon.spy(parentTile, "dispose");
        const parentReloadSpy = sinon.spy(parentTile, "load");

        const visibleTileDisposeSpies = dataSourceTileList[0].visibleTiles.map(tile =>
            sinon.spy(tile, "dispose")
        );

        const visibleTileReloadSpies = dataSourceTileList[0].visibleTiles.map(tile =>
            sinon.spy(tile, "load")
        );

        fixture.vts.markTilesDirty(undefined, tile => tile.tileKey.equals(parentTile.tileKey));

        // only visible should be updated
        assert(visibleTileReloadSpies[0].notCalled);
        assert(visibleTileReloadSpies[1].notCalled);
        assert(parentReloadSpy.notCalled);

        // check that dispose was called correctly
        assert(visibleTileDisposeSpies[0].notCalled);
        assert(visibleTileDisposeSpies[1].notCalled);
        assert(parentDisposeSpy.calledOnce);
    });

    it("caches frustum intersection for data sources with same tiling scheme", async function () {
        setupBerlinCenterCameraFromSamples();
        const zoomLevel = 15;
        const storageLevel = 14;

        const secondDataSource = new FakeOmvDataSource({ name: "omv" });
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

    /**
     * This test shows what happens when a DataSource with a background plane is added with one that
     * `isFullyCovering`.
     */
    it("background data source is skipped by webtile", async function () {
        setupBerlinCenterCameraFromSamples();

        // These tiles will be skipped, because a DataSource that produces [[Tiles]]s without
        // a background plane, but where isFullyCovering is true trumps.
        const fullyCoveringDS1 = new BackgroundDataSource();
        const fullyCoveringDS2 = new FakeWebTile();
        fixture.addDataSource(fullyCoveringDS1);
        fixture.addDataSource(fullyCoveringDS2);

        const zoomLevel = 15;
        const storageLevel = 14;
        const result = updateRenderList(zoomLevel, storageLevel);
        compareDataSources(result.tileList, [fullyCoveringDS1], [fullyCoveringDS2, ...fixture.ds]);
    });

    it(`background data source is skipped by webtile (reversed order)`, async function () {
        setupBerlinCenterCameraFromSamples();

        const fullyCoveringDS1 = new BackgroundDataSource();
        const fullyCoveringDS2 = new FakeWebTile();
        // !! Note the different order added !!
        fixture.addDataSource(fullyCoveringDS2);
        fixture.addDataSource(fullyCoveringDS1);

        const zoomLevel = 15;
        const storageLevel = 14;
        const result = updateRenderList(zoomLevel, storageLevel);
        compareDataSources(result.tileList, [fullyCoveringDS1], [fullyCoveringDS2, ...fixture.ds]);
    });

    /**
     * This test shows what happens when a DataSource with a background plane is added with one that
     * `isFullyCovering`.
     */
    it(`background data source skipped by other fully covering tile`, async function () {
        setupBerlinCenterCameraFromSamples();

        // These tiles won't be skipped, because a DataSource that produces [[Tiles]]s without
        // `isFullyCovering` being true should not impact any others.
        const fullyCoveringDS1 = new BackgroundDataSource();
        const fullyCoveringDS2 = new FakeCoveringTileWMTS(true);
        fixture.addDataSource(fullyCoveringDS1);
        fixture.addDataSource(fullyCoveringDS2);

        const zoomLevel = 15;
        const storageLevel = 14;
        const result = updateRenderList(zoomLevel, storageLevel);
        compareDataSources(result.tileList, [fullyCoveringDS1], [fullyCoveringDS2, ...fixture.ds]);
    });

    it(`background data source not skipped when different tiling scheme used`, async function () {
        setupBerlinCenterCameraFromSamples();

        const fullyCoveringDS1 = new BackgroundDataSource();
        // BackgroundDataSource uses webMercator, so there is no skipping involved.
        const fullyCoveringDS2 = new FakeWebTile(mercatorTilingScheme);
        fixture.addDataSource(fullyCoveringDS1);
        fixture.addDataSource(fullyCoveringDS2);

        const zoomLevel = 15;
        const storageLevel = 14;
        const result = updateRenderList(zoomLevel, storageLevel);
        result.tileList.forEach(dataSourceTileList => {
            dataSourceTileList.visibleTiles.forEach(tile => {
                expect(tile["skipRendering"]).is.false;
            });
        });
    });

    /**
     * This test shows what happens when a BackgroundDataSource is added with one that
     * `isFullyCovering`.
     */
    it(`background data source not skipped
        when other non covering datasource added`, async function () {
        setupBerlinCenterCameraFromSamples();

        // These tiles won't be skipped, because a DataSource that produces [[Tiles]]s without
        // `isFullyCovering` being true should not impact any others.
        const fullyCoveringDS1 = new BackgroundDataSource();
        const fullyCoveringDS2 = new FakeCoveringTileWMTS(false);
        fixture.addDataSource(fullyCoveringDS1);
        fixture.addDataSource(fullyCoveringDS2);

        const zoomLevel = 15;
        const storageLevel = 14;
        const result = updateRenderList(zoomLevel, storageLevel);
        compareDataSources(
            result.tileList,
            [],
            [fullyCoveringDS1, fullyCoveringDS2, ...fixture.ds]
        );
    });

    it("check MapView param tileWrappingEnabled disabled", async function () {
        fixture = new Fixture({
            tileWrappingEnabled: false,
            enableMixedLod: false
        });
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

        const secondDataSource = new FakeOmvDataSource({ name: "omv2" });
        fixture.addDataSource(secondDataSource);
        const result = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(result[0].visibleTiles.length, 5);
    });

    it("check MapView param tileWrappingEnabled enabled", async function () {
        fixture = new Fixture({
            tileWrappingEnabled: true,
            enableMixedLod: false
        });
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

        const secondDataSource = new FakeOmvDataSource({ name: "omv2" });
        fixture.addDataSource(secondDataSource);
        const result = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(result[0].visibleTiles.length, 16);
    });

    it("works with sphere projection", async function () {
        fixture = new Fixture({
            enableMixedLod: false,
            projection: sphereProjection
        });
        fixture.worldCenter = new THREE.Vector3(
            3788505.3859012993,
            900242.0140512662,
            5053901.557774652
        );
        const camera = fixture.camera;
        camera.aspect = 1.7541528239202657;
        camera.near = 1.0;
        camera.far = 40000.0;
        camera.fov = 60;
        camera.setRotationFromEuler(
            new THREE.Euler(-1.8255142103839737, 1.355215881912018, -2.910650891276035, "XYZ")
        );
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 0).add(fixture.worldCenter);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);

        const zoomLevel = 15;
        const storageLevel = 14;

        const secondDataSource = new FakeOmvDataSource({ name: "omv2" });
        fixture.addDataSource(secondDataSource);
        const result = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(result[0].visibleTiles.length, 100);
    });

    it("checks MapView param enableMixedLod", async function () {
        fixture = new Fixture({
            enableMixedLod: true,
            projection: sphereProjection
        });
        fixture.worldCenter = new THREE.Vector3(
            3788505.3859012993,
            900242.0140512662,
            5053901.557774652
        );
        const camera = fixture.camera;
        camera.aspect = 1.7541528239202657;
        camera.near = 1.0;
        camera.far = 40000.0;
        camera.fov = 60;
        camera.setRotationFromEuler(
            new THREE.Euler(-1.8255142103839737, 1.355215881912018, -2.910650891276035, "XYZ")
        );
        camera.scale.set(1, 1, 1);
        camera.position.set(0, 0, 0).add(fixture.worldCenter);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(false);

        const zoomLevel = 15;
        const storageLevel = 14;

        const secondDataSource = new FakeOmvDataSource({ name: "omv2" });
        fixture.addDataSource(secondDataSource);
        const result = updateRenderList(zoomLevel, storageLevel).tileList;
        assert.equal(result[0].visibleTiles.length, 100);
    });

    it("#updateRenderList get tiles from cache", function () {
        const vts = fixture.vts;
        const dataSource = fixture.ds[0];

        const tileKey0 = TileKey.fromMortonCode(371506850);
        const tileKey1 = TileKey.fromMortonCode(371506851);

        // Pre-populate cache.
        const tile0 = vts.getTile(dataSource, tileKey0, 0, 0);
        const tile1 = vts.getTile(dataSource, tileKey1, 0, 0);

        const cachedTile0 = fixture.vts.getCachedTile(dataSource, tileKey0, 0, 0);
        const cachedTile1 = fixture.vts.getCachedTile(dataSource, tileKey1, 0, 0);

        // Test that the cached tiles are returned.
        assert.equal(tile0, cachedTile0);
        assert.equal(tile1, cachedTile1);
    });

    it("#updateRenderList clear all tiles from cache", function () {
        const vts = fixture.vts;
        const dataSource = fixture.ds[0];

        const secondDataSource = new FakeOmvDataSource({ name: "omv2" });
        fixture.addDataSource(secondDataSource);

        const tileKey0 = TileKey.fromMortonCode(371506850);
        const tileKey1 = TileKey.fromMortonCode(371506851);

        // Pre-populate cache.
        assert.notEqual(vts.getTile(dataSource, tileKey0, 0, 0), undefined);
        assert.notEqual(vts.getTile(secondDataSource, tileKey1, 0, 0), undefined);

        fixture.vts.clearTileCache();

        const cachedTile0 = fixture.vts.getCachedTile(dataSource, tileKey0, 0, 0);
        const cachedTile1 = fixture.vts.getCachedTile(secondDataSource, tileKey1, 0, 0);

        // Test that the cached tiles are gone.
        assert.isUndefined(cachedTile0);
        assert.isUndefined(cachedTile1);
    });

    it("#updateRenderList clear tiles from cache by datasource", function () {
        const vts = fixture.vts;
        const dataSource = fixture.ds[0];

        const secondDataSource = new FakeOmvDataSource({ name: "omv2" });
        fixture.addDataSource(secondDataSource);

        const tileKey0 = TileKey.fromMortonCode(371506850);
        const tileKey1 = TileKey.fromMortonCode(371506851);

        // Pre-populate cache.
        assert.notEqual(vts.getTile(dataSource, tileKey0, 0, 0), undefined);
        assert.notEqual(vts.getTile(secondDataSource, tileKey1, 0, 0), undefined);

        fixture.vts.clearTileCache(dataSource);

        const cachedTile0 = fixture.vts.getCachedTile(dataSource, tileKey0, 0, 0);
        const cachedTile1 = fixture.vts.getCachedTile(secondDataSource, tileKey1, 0, 0);

        // Test that the dataSource's cached tiles are gone.
        assert.isUndefined(cachedTile0);
        assert.notEqual(cachedTile1, undefined);
    });

    it("#updateRenderList clear tiles from cache by datasource and predicate", function () {
        const vts = fixture.vts;
        const dataSource = fixture.ds[0];

        const tileKey0 = TileKey.fromMortonCode(371506850);
        const tileKey1 = TileKey.fromMortonCode(371506851);

        // Pre-populate cache.
        assert.notEqual(vts.getTile(dataSource, tileKey0, 0, 0), undefined);
        assert.notEqual(vts.getTile(dataSource, tileKey1, 0, 0), undefined);

        fixture.vts.clearTileCache(dataSource, tile => tile.tileKey === tileKey0);

        const cachedTile0 = fixture.vts.getCachedTile(dataSource, tileKey0, 0, 0);
        const cachedTile1 = fixture.vts.getCachedTile(dataSource, tileKey1, 0, 0);

        // Test that the dataSource's cached tiles that match the tileKey0 are gone.
        assert.isUndefined(cachedTile0);
        assert.notEqual(cachedTile1, undefined);
    });

    it("#updateRenderList clear tiles from cache by predicate", function () {
        const vts = fixture.vts;
        const dataSource = fixture.ds[0];

        const tileKey0 = TileKey.fromMortonCode(371506850);
        const tileKey1 = TileKey.fromMortonCode(371506851);

        // Pre-populate cache.
        assert.notEqual(vts.getTile(dataSource, tileKey0, 0, 0), undefined);
        assert.notEqual(vts.getTile(dataSource, tileKey1, 0, 0), undefined);

        fixture.vts.clearTileCache(undefined, tile => tile.tileKey === tileKey1);

        const cachedTile0 = fixture.vts.getCachedTile(dataSource, tileKey0, 0, 0);
        const cachedTile1 = fixture.vts.getCachedTile(dataSource, tileKey1, 0, 0);

        //Test that the cached tiles which have tileKey equal to tileKey1 are gone.
        assert.isUndefined(cachedTile1);
        assert.notEqual(cachedTile0, undefined);
    });
});
