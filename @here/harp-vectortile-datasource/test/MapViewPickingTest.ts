/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { DecodedTile, Geometry, GeometryType } from "@here/harp-datasource-protocol";
import {
    GeoCoordinates,
    mercatorProjection,
    Projection,
    sphereProjection,
    TileKey,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import {
    CalculationStatus,
    DataSource,
    ElevationProvider,
    ElevationRangeSource,
    MapView,
    MapViewEventNames,
    TileLoaderState
} from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/lib/GeoJsonTiler";
import {
    getTestResourceUrl,
    silenceLoggingAroundFunction,
    waitForEvent
} from "@here/harp-test-utils/";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { FontCatalog } from "@here/harp-text-canvas";
import { getAppBaseUrl } from "@here/harp-utils";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { VectorTileDecoder } from "../index-worker";
import { GeoJsonDataProvider } from "../lib/GeoJsonDataProvider";
import { VectorTileDataSource } from "../lib/VectorTileDataSource";
import { GEOJSON_DATA, THEME } from "./resources/geoJsonData";

declare const global: any;

describe("MapView Picking", async function () {
    const inNodeContext = typeof window === "undefined";
    const tileKey = new TileKey(0, 0, 0);

    const sandbox = sinon.createSandbox();
    let canvas: HTMLCanvasElement;
    let mapView: MapView;
    let geoJsonDataSource: VectorTileDataSource;
    let fakeElevationSource: DataSource;
    let fakeElevationRangeSource: ElevationRangeSource;
    let fakeElevationProvider: ElevationProvider;
    const FAKE_HEIGHT = 500000.0;

    async function getDecodedTile() {
        const tile = geoJsonDataSource.getTile(tileKey)!;

        assert(tile !== undefined);

        assert.isDefined(tile.tileLoader);

        const state = await tile.tileLoader!.loadAndDecode();
        assert.equal(state, TileLoaderState.Ready);

        const decodeTile = tile.decodedTile as DecodedTile;
        assert.isDefined(decodeTile);
        return decodeTile;
    }

    before(function () {
        if (inNodeContext) {
            const g = global as any;
            g.window = {
                window: { devicePixelRatio: 1.0 },
                location: {
                    href: getAppBaseUrl()
                }
            };
            g.navigator = {};
            g.requestAnimationFrame = (cb: (delta: number) => void) => {
                return setTimeout(() => {
                    silenceLoggingAroundFunction("TextElementsRenderer", () => {
                        cb(15);
                    });
                }, 15);
            };
            g.cancelAnimationFrame = (id: any) => {
                return clearTimeout(id);
            };
            g.performance = { now: Date.now };
        }

        // fake texture loading
        sandbox.stub(FontCatalog as any, "loadTexture").callsFake((url: URL) => {
            return {
                image: {
                    width: 512,
                    height: 512
                }
            };
        });

        canvas = ({
            clientWidth: 800,
            clientHeight: 600,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        } as unknown) as HTMLCanvasElement;

        sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, sandbox.stub()));

        sandbox
            .stub(THREE, "WebGL1Renderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, sandbox.stub()));

        fakeElevationSource = {
            name: "terrain",
            attach(view: MapView) {
                this.mapView = view;
            },
            clearCache() {},
            detach() {
                this.mapView = undefined;
            },
            dispose() {},
            connect() {
                return Promise.resolve();
            },
            setEnableElevationOverlay() {},
            setTheme() {},
            addEventListener() {},
            getTilingScheme() {
                return webMercatorTilingScheme;
            },
            setLanguages() {},
            mapView: undefined
        } as any;
        fakeElevationRangeSource = {
            connect: () => Promise.resolve(),
            ready: () => true,
            getTilingScheme: () => webMercatorTilingScheme,
            getElevationRange: () => ({
                minElevation: 0,
                maxElevation: FAKE_HEIGHT,
                calculationStatus: CalculationStatus.FinalPrecise
            })
        } as any;
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
        geoBox.northEast.altitude = FAKE_HEIGHT;
        fakeElevationProvider = {
            clearCache() {},
            getHeight: () => FAKE_HEIGHT,
            sampleHeight: () => FAKE_HEIGHT,
            getDisplacementMap: () => ({
                tileKey,
                texture: new THREE.DataTexture(new Float32Array([FAKE_HEIGHT]), 1, 1),
                displacementMap: {
                    xCountVertices: 1,
                    yCountVertices: 1,
                    buffer: new Float32Array([FAKE_HEIGHT])
                },
                geoBox
            })
        } as any;
    });

    beforeEach(async function () {
        mapView = new MapView({
            canvas,
            decoderCount: 0,
            theme: THEME,
            enableRoadPicking: true,
            disableFading: true,
            fontCatalog: getTestResourceUrl(
                "@here/harp-fontcatalog",
                "resources/Default_FontCatalog.json"
            ),
            addBackgroundDatasource: false
        });

        await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);
        if (mapView.textElementsRenderer.loading) {
            await mapView.textElementsRenderer.waitLoaded();
        }
        sinon.stub(mapView.textElementsRenderer, "renderText").callsFake((_farPlane: number) => {});

        const geoJsonDataProvider = new GeoJsonDataProvider("italy_test", GEOJSON_DATA, {
            tiler: new GeoJsonTiler()
        });

        geoJsonDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            dataProvider: geoJsonDataProvider,
            name: "geojson",
            styleSetName: "geojson",
            gatherFeatureAttributes: true
        });

        await mapView.addDataSource(geoJsonDataSource);
    });

    after(function () {
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.cancelAnimationFrame;
            delete global.navigator;
        }
    });

    describe("Decoded tile tests", async function () {
        it("Decoded tile is created", async () => {
            const decodeTile = await getDecodedTile();

            assert.isDefined(decodeTile.textGeometries);
            assert.isDefined(decodeTile.geometries);
            assert.equal(decodeTile.geometries.length, 3);
        });

        it("Decoded tile contains text pick info", async () => {
            const decodeTile = await getDecodedTile();

            assert.equal(decodeTile.textGeometries!.length, 1);
            const textElem = decodeTile.textGeometries![0];

            assert.isDefined(textElem.objInfos);
            assert.deepInclude(textElem.objInfos![0], GEOJSON_DATA.features[2].properties);
        });

        it("Decoded tile contains line pick data pointer", async () => {
            const decodeTile = await getDecodedTile();
            const lineGeometry = decodeTile.geometries!.find(
                geometry => geometry.type === GeometryType.SolidLine
            );

            assert.isDefined(lineGeometry);
            assert.isDefined(lineGeometry!.groups);
            assert.equal(lineGeometry!.groups.length, 1);
        });

        it("decodedTile contains polygon objInfos", async () => {
            const decodeTile = await getDecodedTile();

            const polygonGeometry = decodeTile.geometries!.find(
                geometry => geometry.type === GeometryType.Polygon
            ) as Geometry;

            assert.isDefined(polygonGeometry, "polygon geometry missing");
            assert.isDefined(polygonGeometry.groups, "polygon geometry groups missing");
            assert.equal(polygonGeometry.groups.length, 2);
            assert.isDefined(polygonGeometry.objInfos, "objInfos missing");
            assert.equal(polygonGeometry.objInfos!.length, 2);

            assert.include(polygonGeometry.objInfos![0], GEOJSON_DATA.features[0].properties);
            assert.include(polygonGeometry.objInfos![1], GEOJSON_DATA.features[3].properties);
        });
    });

    describe("Picking tests", async function () {
        this.timeout(5000);

        const pickPolygonAt: number[] = [13.084716796874998, 22.61401087437029];
        const pickPolyOutlineAt: number[] = [-1.0, 29.0];
        const pickLineAt: number[] = ((GEOJSON_DATA.features[1].geometry as any)
            .coordinates as number[][])[0];
        const pickLabelAt: number[] = (GEOJSON_DATA.features[2].geometry as any).coordinates;
        const offCenterLabelLookAt: number[] = [pickLabelAt[0] + 10.0, pickLabelAt[1] + 10.0];

        it("Features in a data source with picking disabled are not picked", async () => {
            geoJsonDataSource.enablePicking = false;
            const target = new GeoCoordinates(pickPolygonAt[1], pickPolygonAt[0]);
            mapView.lookAt({ target, tilt: 60, zoomLevel: 2 });
            await waitForEvent(mapView, MapViewEventNames.FrameComplete);

            const screenPointLocation = mapView.getScreenPosition(target) as THREE.Vector2;
            assert.isDefined(screenPointLocation);

            mapView.scene.updateWorldMatrix(false, true);

            const usableIntersections = mapView
                .intersectMapObjects(screenPointLocation.x, screenPointLocation.y)
                .filter(item => item.userData !== undefined);

            assert.equal(usableIntersections.length, 0);
        });

        interface TestCase {
            name: string;
            rayOrigGeo: number[];
            featureIdx: number;
            projection: Projection;
            elevation: boolean;
            pixelRatio?: number;
            lookAt?: number[];
            // Whether to test a shift of 360.0 degrees
            shiftLongitude: boolean;
            addDependency?: boolean;
        }

        const testCases: TestCase[] = [];

        for (const { projName, projection } of [
            { projName: "mercator", projection: mercatorProjection },
            { projName: "sphere", projection: sphereProjection }
        ]) {
            for (const elevation of [false, true]) {
                const elevatedText = elevation ? "elevated " : " ";
                for (const shiftLongitude of [false, true]) {
                    testCases.push(
                        {
                            name: `Pick ${elevatedText}polygon in ${projName} projection. \
                            Shifted: ${shiftLongitude}`,
                            rayOrigGeo: elevation
                                ? pickPolygonAt.concat([FAKE_HEIGHT])
                                : pickPolygonAt,
                            featureIdx: 0,
                            projection,
                            elevation,
                            shiftLongitude
                        },
                        {
                            name: `Pick ${elevatedText}polygon outline in ${projName} projection. \
                            Shifted: ${shiftLongitude}`,
                            rayOrigGeo: elevation
                                ? pickPolyOutlineAt.concat([FAKE_HEIGHT])
                                : pickPolyOutlineAt,
                            featureIdx: 3,
                            projection,
                            elevation,
                            shiftLongitude
                        },
                        {
                            name: `Pick ${elevatedText}solid line in ${projName} projection. \
                            Shifted: ${shiftLongitude}`,
                            rayOrigGeo: elevation ? pickLineAt.concat([FAKE_HEIGHT]) : pickLineAt,
                            featureIdx: 1,
                            projection,
                            elevation,
                            shiftLongitude
                        },
                        {
                            name: `Pick ${elevatedText}label in ${projName} projection. \
                            Shifted: ${shiftLongitude}`,
                            rayOrigGeo: elevation ? pickLabelAt.concat([FAKE_HEIGHT]) : pickLabelAt,
                            featureIdx: 2,
                            projection,
                            elevation,
                            pixelRatio: 1,
                            shiftLongitude
                        },
                        {
                            name: `Pick ${elevatedText}label in ${projName} projection on HiDPI \
                            Screen. Shifted: ${shiftLongitude}`,
                            rayOrigGeo: elevation ? pickLabelAt.concat([FAKE_HEIGHT]) : pickLabelAt,
                            featureIdx: 2,
                            projection,
                            elevation,
                            pixelRatio: 2,
                            // Any pixel ratio related bug might not be reproducible with a label
                            // centered on screen, move the camera target away from the label.
                            lookAt: elevation
                                ? offCenterLabelLookAt.concat([FAKE_HEIGHT])
                                : offCenterLabelLookAt,
                            // TODO: Investigate why this fails when picking on a HiDPI screen
                            shiftLongitude: false
                        }
                    );
                }
            }
        }

        testCases.push({
            name: `Pick polygon in planar projection with dependency`,
            rayOrigGeo: pickPolygonAt,
            featureIdx: 0,
            projection: mercatorProjection,
            elevation: false,
            shiftLongitude: false,
            addDependency: true,
            lookAt: offCenterLabelLookAt
        });

        for (const testCase of testCases) {
            it(testCase.name, async () => {
                mapView.projection = testCase.projection;

                if (testCase.pixelRatio !== undefined) {
                    mapView.pixelRatio = testCase.pixelRatio;
                }

                if (testCase.elevation) {
                    await mapView.setElevationSource(
                        fakeElevationSource,
                        fakeElevationRangeSource,
                        fakeElevationProvider
                    );
                }

                const feature = GEOJSON_DATA.features[testCase.featureIdx];
                const rayOrigGeo = testCase.rayOrigGeo;

                const rayOrigin = new GeoCoordinates(
                    rayOrigGeo[1],
                    rayOrigGeo[0] + (testCase.shiftLongitude ? 360.0 : 0.0),
                    rayOrigGeo.length > 2 ? rayOrigGeo[2] : undefined
                );

                // Set lookAt as camera target if given, otherwise use ray origin.
                const target = testCase.lookAt
                    ? new GeoCoordinates(
                          testCase.lookAt[1],
                          testCase.lookAt[0],
                          testCase.lookAt.length > 2 ? testCase.lookAt[2] : undefined
                      )
                    : rayOrigin;

                let stub: sinon.SinonStub | undefined;
                if (testCase.addDependency === true) {
                    stub = sinon
                        .stub(geoJsonDataSource, "getTile")
                        .callsFake((_tileKey: TileKey, delayLoad?: boolean) => {
                            const tile = stub!.wrappedMethod.bind(geoJsonDataSource)(
                                _tileKey,
                                delayLoad
                            );
                            if (tile !== undefined) {
                                tile.dependencies.push(
                                    TileKey.fromRowColumnLevel(
                                        (_tileKey.row + 1) % _tileKey.rowCount(),
                                        _tileKey.column,
                                        _tileKey.level
                                    )
                                );
                                tile.dependencies.push(
                                    TileKey.fromRowColumnLevel(
                                        _tileKey.row,
                                        (_tileKey.column + 1) % _tileKey.columnCount(),
                                        _tileKey.level
                                    )
                                );
                            }
                            return tile;
                        });
                }

                mapView.lookAt({ target, tilt: 60, zoomLevel: 2 });
                await waitForEvent(mapView, MapViewEventNames.FrameComplete);
                // Reset back to the original function
                if (stub !== undefined) {
                    stub.restore();
                }

                const screenPointLocation = mapView.getScreenPosition(rayOrigin) as THREE.Vector2;
                assert.isDefined(screenPointLocation);

                mapView.scene.updateWorldMatrix(false, true);

                const usableIntersections = mapView
                    .intersectMapObjects(screenPointLocation.x, screenPointLocation.y)
                    .filter(item => item.userData !== undefined);

                assert.equal(usableIntersections.length, 1);
                assert.include(usableIntersections[0].userData, feature.properties);
            });
        }
    });
});
