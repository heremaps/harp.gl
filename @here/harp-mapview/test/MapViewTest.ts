/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Expr, getProjectionName } from "@here/harp-datasource-protocol";
import {
    GeoBox,
    GeoCoordinates,
    GeoCoordinatesLike,
    GeoPolygon,
    MAX_LONGITUDE,
    MercatorConstants,
    mercatorProjection,
    MIN_LONGITUDE,
    sphereProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import {
    getTestResourceUrl,
    silenceLoggingAroundFunction,
    waitForEvent
} from "@here/harp-test-utils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { assert, expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { BackgroundDataSource } from "../lib/BackgroundDataSource";
import { DataSource } from "../lib/DataSource";
import { ElevationProvider } from "../lib/ElevationProvider";
import { CalculationStatus, ElevationRangeSource } from "../lib/ElevationRangeSource";
import { MapMaterialAdapter } from "../lib/MapMaterialAdapter";
import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { MapView, MapViewEventNames, MapViewOptions } from "../lib/MapView";
import { DEFAULT_CLEAR_COLOR } from "../lib/MapViewEnvironment";
import { MapViewFog } from "../lib/MapViewFog";
import * as FontCatalogLoader from "../lib/text/FontCatalogLoader";
import { MapViewUtils } from "../lib/Utils";
import { VisibleTileSet } from "../lib/VisibleTileSet";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

//    expect-type assertions are unused expressions and are perfectly valid

//    lots of stubs are needed which are just placeholders and are empty

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

declare const global: any;

const projections = [mercatorProjection, sphereProjection];

describe("MapView", function () {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    let mapViewOptions: MapViewOptions;
    let mapView: MapView | undefined;

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        sandbox
            .stub(THREE, "WebGL1Renderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        sandbox.stub(FontCatalogLoader, "loadFontCatalog").resolves();
        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = (callback: (time: DOMHighResTimeStamp) => void) => {
                setTimeout(callback, 0);
            };
        }
        addEventListenerSpy = sinon.stub();
        removeEventListenerSpy = sinon.stub();
        canvas = ({
            clientWidth: 400,
            clientHeight: 300,
            addEventListener: addEventListenerSpy,
            removeEventListener: removeEventListenerSpy
        } as unknown) as HTMLCanvasElement;
        mapViewOptions = {
            canvas,
            // Both options cause the `addDataSource` method to be called, which we can't `await` on
            // because it is called in the constructor, but we can disable them being added.
            addBackgroundDatasource: false,
            enablePolarDataSource: false
        };
    });

    afterEach(async function () {
        if (mapView !== undefined) {
            await mapView.getTheme();
            mapView.dispose();
            mapView = undefined;
        }
        sandbox.restore();
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.cancelAnimationFrame;
            delete global.navigator;
        }
    });

    //
    // This test is broken, because `setCameraGeolocationAndZoom` doesn't behave as expected, i.e
    // it offsets actual `geoCenter` a little.
    //
    // TODO: check who is right? this test or `setCameraGeolocationAndZoom` implementation
    //
    it.skip("Correctly sets geolocation and zoom", function () {
        const coords: GeoCoordinates = new GeoCoordinates(52.5145, 13.3501);

        const rotationSpy = sinon.spy(MapViewUtils, "setRotation");
        const zoomSpy = sinon.spy(MapViewUtils, "zoomOnTargetPosition");

        mapView = new MapView(mapViewOptions);
        mapView.setCameraGeolocationAndZoom(coords, 18, 10, 20);

        expect(zoomSpy.calledOnce).to.be.true;
        expect(zoomSpy.calledWith(mapView, 0, 0, 18)).to.be.true;
        expect(rotationSpy.calledOnce).to.be.true;
        expect(rotationSpy.calledWith(mapView, 10, 20)).to.be.true;
        expect(mapView.geoCenter.latitude).to.be.closeTo(coords.latitude, 0.000000000001);
        expect(mapView.geoCenter.longitude).to.be.closeTo(coords.longitude, 0.000000000001);
    });

    for (const { projection, projectionName, epsilon } of [
        {
            projection: sphereProjection,
            projectionName: "sphere",
            // On sphere, we do lots of math and unfortunately loose lots of precision
            epsilon: 1e-10
        },
        {
            projection: mercatorProjection,
            projectionName: "mercator",
            // ... comparing to flat projection.
            epsilon: 1e-13
        }
    ]) {
        describe(`camera positioning - ${projectionName} projection`, function () {
            for (const { testName, lookAtParams } of [
                {
                    testName: "berlin/18 topView",
                    lookAtParams: {
                        target: new GeoCoordinates(52.5145, 13.3501),
                        zoomLevel: 18
                    }
                },
                {
                    testName: "berlin/18 tilted/rotated",
                    lookAtParams: {
                        target: new GeoCoordinates(52.5145, 13.3501),
                        zoomLevel: 18,
                        tilt: 10,
                        heading: 20
                    }
                },
                {
                    testName: "france/6 topView",
                    lookAtParams: {
                        target: new GeoCoordinates(47.232873, 1.2194824999999998),
                        zoom: 6.7
                    }
                },
                {
                    testName: "france/6 tilted/rotated",
                    lookAtParams: {
                        target: new GeoCoordinates(47.232873, 1.2194824999999998),
                        zoom: 6.7,
                        tilt: 25,
                        heading: 15
                    }
                },
                {
                    testName: "usa/5 topView",
                    lookAtParams: {
                        target: new GeoCoordinates(40.60472, -103.0152),
                        zoom: 5
                    }
                },
                {
                    testName: "usa/5 tilted/rotated",
                    lookAtParams: {
                        target: new GeoCoordinates(40.60472, -103.0152),
                        zoom: 5,
                        tilt: 30,
                        heading: -160
                    }
                },
                {
                    testName: "berlin bounds only",
                    lookAtParams: {
                        bounds: new GeoBox(
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.590844, 13.522331)
                        )
                    }
                },
                {
                    testName: "berlin bounds + zoomLevel",
                    lookAtParams: {
                        bounds: new GeoBox(
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.590844, 13.522331)
                        ),
                        zoomLevel: 10
                    }
                },
                {
                    testName: "berlin bounds + distance",
                    lookAtParams: {
                        bounds: new GeoBox(
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.590844, 13.522331)
                        ),
                        distance: 38200,
                        expectAllInView: false
                    }
                },
                {
                    testName: "berlin bounds + distance + angles",
                    lookAtParams: {
                        bounds: new GeoBox(
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.590844, 13.522331)
                        ),
                        tilt: 45,
                        heading: 45
                    }
                },
                {
                    testName: "berlin polygon bounds only",
                    lookAtParams: {
                        bounds: new GeoPolygon([
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.438917, 13.522331),
                            new GeoCoordinates(52.590844, 13.522331),
                            new GeoCoordinates(52.590844, 13.275001)
                        ])
                    }
                },
                {
                    testName: "berlin polygon bounds + zoomLevel",
                    lookAtParams: {
                        bounds: new GeoPolygon([
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.438917, 13.522331),
                            new GeoCoordinates(52.590844, 13.522331),
                            new GeoCoordinates(52.590844, 13.275001)
                        ]),
                        zoomLevel: 10
                    }
                },
                {
                    testName: "berlin polygon bounds + distance",
                    lookAtParams: {
                        bounds: new GeoPolygon([
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.438917, 13.522331),
                            new GeoCoordinates(52.590844, 13.522331),
                            new GeoCoordinates(52.590844, 13.275001)
                        ]),

                        distance: 38200,
                        expectAllInView: false
                    }
                },
                {
                    testName: "berlin polygonbounds + distance + angles",
                    lookAtParams: {
                        bounds: new GeoPolygon([
                            new GeoCoordinates(52.438917, 13.275001),
                            new GeoCoordinates(52.438917, 13.522331),
                            new GeoCoordinates(52.590844, 13.522331),
                            new GeoCoordinates(52.590844, 13.275001)
                        ]),
                        tilt: 45,
                        heading: 45
                    }
                }
            ]) {
                it(`obeys constructor params - ${testName}`, function () {
                    mapView = new MapView({
                        ...mapViewOptions,
                        projection,
                        ...lookAtParams
                    });

                    if (lookAtParams.zoomLevel !== undefined) {
                        expect(mapView.zoomLevel).to.be.closeTo(lookAtParams.zoomLevel, epsilon);
                    }
                    if (lookAtParams.target !== undefined) {
                        expect(mapView.target.latitude).to.be.closeTo(
                            lookAtParams.target.latitude,
                            epsilon
                        );
                        expect(mapView.target.longitude).to.be.closeTo(
                            lookAtParams.target.longitude,
                            epsilon
                        );
                    }
                    if (lookAtParams.tilt !== undefined) {
                        expect(mapView.tilt).to.be.closeTo(lookAtParams.tilt, epsilon);
                    }
                    if (lookAtParams.heading !== undefined) {
                        expect(mapView.heading).to.be.closeTo(lookAtParams.heading, epsilon);
                    }
                });
                it(`obeys #lookAt params - ${testName}`, function () {
                    mapView = new MapView({
                        ...mapViewOptions,
                        projection
                    });

                    mapView.lookAt(lookAtParams);

                    if (lookAtParams.zoomLevel !== undefined) {
                        expect(mapView.zoomLevel).to.be.closeTo(lookAtParams.zoomLevel, epsilon);
                    }
                    if (lookAtParams.target !== undefined) {
                        expect(mapView.target.latitude).to.be.closeTo(
                            lookAtParams.target.latitude,
                            epsilon
                        );
                        expect(mapView.target.longitude).to.be.closeTo(
                            lookAtParams.target.longitude,
                            epsilon
                        );
                    }
                    if (lookAtParams.tilt !== undefined) {
                        expect(mapView.tilt).to.be.closeTo(lookAtParams.tilt, epsilon);
                    }
                    if (lookAtParams.heading !== undefined) {
                        expect(mapView.heading).to.be.closeTo(lookAtParams.heading, epsilon);
                    }
                    if (lookAtParams.bounds !== undefined) {
                        let center: GeoCoordinatesLike | undefined;
                        let geoPoints: GeoCoordinatesLike[] = [];
                        if (lookAtParams.bounds instanceof GeoBox) {
                            center = lookAtParams.bounds.center;
                            geoPoints.push(lookAtParams.bounds.northEast);
                            geoPoints.push(lookAtParams.bounds.southWest);
                            geoPoints.push(
                                new GeoCoordinates(
                                    lookAtParams.bounds.south,
                                    lookAtParams.bounds.east
                                )
                            );
                            geoPoints.push(
                                new GeoCoordinates(
                                    lookAtParams.bounds.north,
                                    lookAtParams.bounds.west
                                )
                            );
                        } else if (lookAtParams.bounds instanceof GeoPolygon) {
                            center = lookAtParams.bounds.getCentroid();
                            geoPoints = lookAtParams.bounds.coordinates as GeoCoordinatesLike[];
                        }
                        expect(center).not.to.be.undefined;
                        if (center !== undefined) {
                            expect(mapView.target.latitude).to.be.closeTo(center.latitude, epsilon);
                            expect(mapView.target.longitude).to.be.closeTo(
                                center.longitude,
                                epsilon
                            );
                        }
                        if (
                            lookAtParams.expectAllInView === undefined ||
                            lookAtParams.expectAllInView === true
                        ) {
                            //render once to update near and far plane
                            mapView.renderSync();

                            geoPoints.forEach(point => {
                                //const worldPoint: Vector3 = new Vector3(0, 0);
                                const worldPoint = mapView?.projection.projectPoint(point);
                                expect(worldPoint).not.to.be.undefined;
                                if (worldPoint !== undefined && mapView?.camera !== undefined) {
                                    expect(
                                        MapViewUtils.closeToFrustum(
                                            worldPoint as THREE.Vector3,
                                            mapView?.camera,
                                            0.00001
                                        )
                                    ).to.be.true;
                                }
                            });
                        }

                        if (lookAtParams.zoomLevel) {
                            expect(mapView.zoomLevel).to.be.closeTo(
                                lookAtParams.zoomLevel,
                                epsilon
                            );
                        }

                        if (lookAtParams.distance) {
                            expect(mapView.targetDistance).to.be.closeTo(
                                lookAtParams.distance,
                                1e-8
                            );
                        }
                    }
                });
            }
        });
    }
    it("Correctly sets target and zoom from options in constructor", function () {
        mapView = new MapView({
            ...mapViewOptions,
            target: new GeoCoordinates(52.5145, 13.3501),
            zoomLevel: 18,
            tilt: 10,
            heading: 20
        });

        expect(mapView.zoomLevel).to.equal(18);
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
        expect(mapView.tilt).to.be.closeTo(10, 1e-13);
        expect(mapView.heading).to.be.closeTo(20, 1e-13);
    });

    it("Correctly sets geolocation and zoom from options in constructor with sphere projection", function () {
        mapView = new MapView({
            ...mapViewOptions,
            projection: sphereProjection,
            target: new GeoCoordinates(52.5145, 13.3501),
            zoomLevel: 18,
            tilt: 10,
            heading: 20
        });

        expect(mapView.zoomLevel).to.be.closeTo(18, 1e-10);
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
        // TODO: For sphere projection the result is off by quite a bit.
        // Are these only floating-point issues?
        expect(mapView.tilt).to.be.closeTo(10, 1e-3);
        expect(mapView.heading).to.be.closeTo(20, 1e-3);
    });

    it("Correctly set and get zoom", function () {
        mapView = new MapView({
            ...mapViewOptions,
            tilt: 45,
            heading: 90
        });

        for (let i = 1; i <= 20; i += 0.1) {
            mapView.zoomLevel = i;
            expect(mapView.zoomLevel).to.be.closeTo(i, 1e-10);
        }
    });

    it("Correctly clamp zoom", function () {
        mapView = new MapView(mapViewOptions);

        mapView.zoomLevel = 0;
        expect(mapView.zoomLevel).to.be.equal(1);

        mapView.zoomLevel = 21;
        expect(mapView.zoomLevel).to.be.equal(20);
    });

    it("Distance bigger than lowest zoomLevel", function () {
        mapView = new MapView(mapViewOptions);

        mapView.zoomLevel = 1;
        const distance = mapView.targetDistance * 2;
        mapView.lookAt({ distance });
        expect(mapView.targetDistance).to.be.equal(distance);
        expect(mapView.zoomLevel).to.be.equal(1);
    });

    it("Distance lower than highest zoomLevel", function () {
        mapView = new MapView(mapViewOptions);

        mapView.zoomLevel = 20;
        const distance = mapView.targetDistance / 2;
        mapView.lookAt({ distance });
        expect(mapView.targetDistance).to.be.equal(distance);
        expect(mapView.zoomLevel).to.be.equal(20);
    });

    it("Correctly set and get tilt", function () {
        const zoomLevel = 10;
        mapView = new MapView({
            ...mapViewOptions,
            zoomLevel
        });

        for (let tilt = 0; tilt < 89; tilt += 1.0) {
            mapView.tilt = tilt;
            expect(mapView.zoomLevel).to.be.closeTo(zoomLevel, 1e-10);
            expect(mapView.tilt).to.be.closeTo(tilt, 1e-10);
        }
    });

    it("Correctly sets geolocation with GeoPointLike as parameter in constructor", function () {
        mapView = new MapView({
            ...mapViewOptions,
            target: [13.3501, 52.5145],
            zoomLevel: 18,
            tilt: 10,
            heading: 20
        });

        expect(mapView.zoomLevel).to.equal(18);
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
        expect(mapView.tilt).to.be.closeTo(10, 1e-13);
        expect(mapView.heading).to.be.closeTo(20, 1e-13);
    });

    it("Correctly sets geolocation with GeoCoordinatesLike as parameter in constructor", function () {
        mapView = new MapView({
            ...mapViewOptions,
            target: {
                latitude: 52.5145,
                longitude: 13.3501
            },
            zoomLevel: 18,
            tilt: 10,
            heading: 20
        });

        expect(mapView.zoomLevel).to.equal(18);
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
        expect(mapView.tilt).to.be.closeTo(10, 1e-13);
        expect(mapView.heading).to.be.closeTo(20, 1e-13);
    });

    it("Correctly sets geolocation with LatLngLike as parameter in constructor", function () {
        mapView = new MapView({
            ...mapViewOptions,
            target: {
                lat: 52.5145,
                lng: 13.3501
            },
            zoomLevel: 18,
            tilt: 10,
            heading: 20
        });

        expect(mapView.zoomLevel).to.equal(18);
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
        expect(mapView.tilt).to.be.closeTo(10, 1e-13);
        expect(mapView.heading).to.be.closeTo(20, 1e-13);
    });

    it("Correctly sets geolocation with GeoPointLike", function () {
        mapView = new MapView(mapViewOptions);

        mapView.lookAt({
            target: [13.3501, 52.5145]
        });
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
    });

    it("Correctly sets target with GeoCoordinatesLike", function () {
        mapView = new MapView(mapViewOptions);

        mapView.lookAt({
            target: {
                latitude: 52.5145,
                longitude: 13.3501
            }
        });
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
    });

    it("Correctly sets target with LatLngLike", function () {
        mapView = new MapView(mapViewOptions);

        mapView.lookAt({
            target: {
                lat: 52.5145,
                lng: 13.3501
            }
        });
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
    });

    it("Correctly set and get distance", function () {
        mapView = new MapView({
            ...mapViewOptions,
            tilt: 45,
            heading: 90
        });

        for (let distance = 100; distance <= 20000000; distance *= 2) {
            mapView.lookAt({ distance });
            expect(mapView.targetDistance).to.be.closeTo(distance, 1e-8);
        }
    });

    it("Correctly sets event listeners and handlers webgl context restored", async function () {
        mapView = new MapView(mapViewOptions);

        expect(addEventListenerSpy.callCount).to.be.equal(2);
        expect(addEventListenerSpy.callCount).to.be.equal(2);
        expect(addEventListenerSpy.getCall(0).args[0]).to.be.equal("webglcontextlost");
        expect(!!addEventListenerSpy.getCall(0).args[1]).to.be.equal(true);
        expect(addEventListenerSpy.getCall(1).args[0]).to.be.equal("webglcontextrestored");
        expect(!!addEventListenerSpy.getCall(1).args[1]).to.be.equal(true);

        const webGlContextRestoredHandler = addEventListenerSpy.getCall(1).args[1];
        const webGlContextLostHandler = addEventListenerSpy.getCall(0).args[1];

        await silenceLoggingAroundFunction(["MapViewThemeManager", "MapView"], async () => {
            await mapView!.setTheme({
                clearColor: "#ffffff"
            });

            expect(clearColorStub.calledWith("#ffffff"));
            await webGlContextRestoredHandler();
            expect(clearColorStub.calledWith(DEFAULT_CLEAR_COLOR));

            await mapView!.setTheme({
                clearColor: undefined
            });

            expect(clearColorStub.calledWith(DEFAULT_CLEAR_COLOR));

            await webGlContextRestoredHandler();
            expect(clearColorStub.calledWith(DEFAULT_CLEAR_COLOR));

            webGlContextLostHandler();
            expect(clearColorStub.calledWith(DEFAULT_CLEAR_COLOR));
        });
    });

    it("Correctly sets and removes all event listeners by API", function () {
        const checkEvent = (eventName: string) => {
            mapView = new MapView(mapViewOptions);

            const callStub = sinon.stub();

            mapView.addEventListener(eventName as MapViewEventNames, callStub);
            mapView.dispatchEvent({ type: eventName as MapViewEventNames });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' not called properly.`
            );

            mapView.removeEventListener(eventName as MapViewEventNames, callStub);
            mapView.dispatchEvent({ type: eventName as MapViewEventNames });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' not removed properly.`
            );
        };

        const events = Object.keys(MapViewEventNames);
        for (const event of events) {
            checkEvent(event);
        }
    });

    it("correctly set and get tile wrapping mode", function () {
        mapView = new MapView({ ...mapViewOptions, projection: mercatorProjection });
        const vts = mapView.visibleTileSet;
        mapView.tileWrappingEnabled = false;
        expect(mapView.tileWrappingEnabled).equal(false);
        const vts2 = mapView.visibleTileSet;
        // Ensure the VisibleTileSet was recreated
        expect(vts).to.be.not.equal(vts2);
    });

    it("ignore set and get tile wrapping mode for sphere projection", function () {
        mapView = new MapView({ ...mapViewOptions, projection: sphereProjection });
        silenceLoggingAroundFunction("MapView", () => {
            mapView!.tileWrappingEnabled = false; // Ignore warning here
        });
        expect(mapView.tileWrappingEnabled).equal(true);
    });

    it("supports #dispose", async function () {
        const dataSource = new FakeOmvDataSource({ name: "omv" });
        const dataSourceDisposeStub = sinon.stub(dataSource, "dispose");
        mapView = new MapView(mapViewOptions);
        await mapView.getTheme();
        await mapView.addDataSource(dataSource);

        const disposeStub = sinon.stub();
        mapView!.addEventListener(MapViewEventNames.Dispose, disposeStub);

        await dataSource.connect();

        expect(mapView.disposed).to.be.equal(false);

        mapView.dispose();

        expect(mapView.disposed).to.be.equal(true);
        expect(dataSourceDisposeStub.callCount).to.be.equal(1);
        expect(addEventListenerSpy.callCount).to.be.equal(2);
        expect(removeEventListenerSpy.callCount).to.be.equal(2);
        expect(disposeStub.callCount).to.be.equal(1, `Dispose event listener not called`);
        mapView = undefined!;
    });

    it("#dispose removes event listeners", async function () {
        const dataSource = new FakeOmvDataSource({ name: "omv" });
        mapView = new MapView(mapViewOptions);
        await mapView.getTheme();
        await mapView.addDataSource(dataSource);
        await dataSource.connect();

        const eventStubs: Map<string, sinon.SinonStub> = new Map();

        const addEvent = (eventName: string) => {
            const callStub = sinon.stub();
            mapView!.addEventListener(eventName as MapViewEventNames, callStub);
            eventStubs.set(eventName, callStub);
        };

        const callEvent = (eventName: string) => {
            const callStub = eventStubs.get(eventName)!;

            mapView!.dispatchEvent({ type: eventName as MapViewEventNames });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' not called correctly`
            );
        };

        const callEventAfterDispose = (eventName: string) => {
            const callStub = eventStubs.get(eventName)!;

            mapView!.dispatchEvent({ type: eventName as MapViewEventNames });

            expect(callStub.callCount).to.be.equal(
                1,
                `Event listener '${eventName}' still active after dispose`
            );
        };

        const events = Object.keys(MapViewEventNames);
        for (const event of events) {
            addEvent(event);
        }
        for (const event of events) {
            callEvent(event);
        }

        mapView.dispose();

        for (const event of events) {
            callEventAfterDispose(event);
        }

        mapView = undefined!;
    });

    it("maintains vertical fov limit", function () {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            ...mapViewOptions,
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "fixed", fov }
        });
        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("maintains horizontal fov limit", function () {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            ...mapViewOptions,
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "fixed", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that the FOV doesn't change
        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("changes vertical fov when resizing with dynamic fov", function () {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            ...mapViewOptions,
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "dynamic", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that resizing height changes the FOV (because we specified a dynamic calculation)
        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.not.eq(fov);
    });

    it("not changes horizontal fov when resizing with focal length", function () {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            ...mapViewOptions,
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "dynamic", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that resizing width keeps the FOV constant with dynamic fov.
        mapView.resize(101, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("returns the fog through #fog getter", function () {
        mapView = new MapView(mapViewOptions);
        expect(mapView.fog instanceof MapViewFog).to.equal(true);
    });

    it("converts screen coords to geo to screen w/ different pixel ratio", async function () {
        const customCanvas = {
            clientWidth: 1920,
            clientHeight: 1080,
            pixelRatio: 1,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };

        const customMapViewOptions = {
            ...mapViewOptions,
            canvas: (customCanvas as any) as HTMLCanvasElement
        };
        for (let x = -100; x <= 100; x += 100) {
            for (let y = -100; y <= 100; y += 100) {
                mapView = new MapView(customMapViewOptions);
                await mapView.getTheme();
                const resultA = mapView.getScreenPosition(mapView.getGeoCoordinatesAt(x, y)!);
                mapView.dispose();

                customCanvas.pixelRatio = 2;
                mapView = new MapView(customMapViewOptions);
                await mapView.getTheme();
                const resultB = mapView.getScreenPosition(mapView.getGeoCoordinatesAt(x, y)!);

                expect(resultA!.x).to.be.closeTo(resultB!.x, 0.00000001);
                expect(resultA!.y).to.be.closeTo(resultB!.y, 0.00000001);
                expect(resultA!.x).to.be.closeTo(x, 0.00000001);
                expect(resultA!.y).to.be.closeTo(y, 0.00000001);
                mapView.dispose();
                mapView = undefined;
            }
        }
    });
    it("converts screen coords to world to screen w/ different pixel ratio", async function () {
        const customCanvas = {
            clientWidth: 1920,
            clientHeight: 1080,
            pixelRatio: 1,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };

        const customMapViewOptions = {
            ...mapViewOptions,
            canvas: (customCanvas as any) as HTMLCanvasElement
        };
        for (let x = -100; x <= 100; x += 100) {
            for (let y = -100; y <= 100; y += 100) {
                mapView = new MapView(customMapViewOptions);
                await mapView.getTheme();
                const resultA = mapView.getScreenPosition(mapView.getWorldPositionAt(x, y)!);
                mapView.dispose();

                customCanvas.pixelRatio = 2;
                mapView = new MapView(customMapViewOptions);
                await mapView.getTheme();
                const resultB = mapView.getScreenPosition(mapView.getWorldPositionAt(x, y)!);

                expect(resultA!.x).to.be.closeTo(resultB!.x, 0.00000001);
                expect(resultA!.y).to.be.closeTo(resultB!.y, 0.00000001);
                expect(resultA!.x).to.be.closeTo(x, 0.00000001);
                expect(resultA!.y).to.be.closeTo(y, 0.00000001);
                mapView.dispose();
                mapView = undefined;
            }
        }
    });

    projections.forEach(projection => {
        const projectionName = getProjectionName(projection);

        it(`convert screen to geo different tilt ${projectionName}`, async function () {
            const sphere = projection === sphereProjection;
            const eps = projection === sphereProjection ? 1e-9 : 1e-10;
            const target = new GeoCoordinates(52.5145, 13.3501);
            mapView = new MapView({
                ...mapViewOptions,
                target,
                tilt: 0,
                zoomLevel: 10,
                projection
            });
            for (let tilt = 0; tilt < 90; ++tilt) {
                mapView.tilt = tilt;
                const center = mapView.getGeoCoordinatesAt(
                    canvas.clientWidth / 2,
                    canvas.clientHeight / 2
                );
                assert.isNotNull(center);
                assert.closeTo(center!.latitude, target.latitude, eps);
                assert.closeTo(center!.longitude, target.longitude, eps);
                assert.isDefined(center!.altitude);
                assert.closeTo(center!.altitude!, 0, eps);

                const left = mapView.getGeoCoordinatesAt(0, canvas.clientHeight / 2);
                assert.isNotNull(left);
                if (sphere) {
                    // When looking top down the line of latitude is not straight
                    // but going up to the sides (in the northern hemisphere).
                    // For high tilt angles it is the opposite.
                    if (tilt < 53) {
                        assert.isBelow(left!.latitude, target.latitude);
                    } else {
                        assert.isAbove(left!.latitude, target.latitude);
                    }
                } else {
                    assert.closeTo(left!.latitude, target.latitude, eps);
                }
                assert.isBelow(left!.longitude, target.longitude);
                assert.isDefined(left!.altitude);
                assert.closeTo(left!.altitude!, 0, eps);

                const right = mapView.getGeoCoordinatesAt(
                    canvas.clientWidth,
                    canvas.clientHeight / 2
                );
                assert.isNotNull(right);
                if (sphere) {
                    if (tilt < 53) {
                        assert.isBelow(right!.latitude, target.latitude);
                    } else {
                        assert.isAbove(right!.latitude, target.latitude);
                    }
                } else {
                    assert.closeTo(right!.latitude, target.latitude, eps);
                }
                assert.isAbove(right!.longitude, target.longitude);
                assert.isDefined(right!.altitude);
                assert.closeTo(right!.altitude!, 0, eps);

                const bottom = mapView.getGeoCoordinatesAt(
                    canvas.clientWidth / 2,
                    canvas.clientHeight
                );
                assert.isNotNull(bottom);
                assert.isBelow(bottom!.latitude, target.latitude);
                assert.closeTo(bottom!.longitude, target.longitude, eps);
                assert.isDefined(bottom!.altitude);
                assert.closeTo(bottom!.altitude!, 0, eps);

                let top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);
                if (tilt <= (sphere ? 65 : 70)) {
                    assert.isNotNull(top);
                    assert.isDefined(top!.altitude);
                    assert.closeTo(top!.altitude!, 0, eps);
                } else {
                    assert.isNull(top);
                    top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0, true);
                    assert.isNotNull(top);
                    assert.isDefined(top!.altitude);
                    assert.isAbove(top!.altitude!, 0);
                }
                assert.isAbove(top!.latitude, target.latitude);
                assert.closeTo(top!.longitude, target.longitude, eps);
            }
        });
    });

    projections.forEach(projection => {
        const projectionName = getProjectionName(projection);

        it(`convert screen to geo different zoom ${projectionName}`, async function () {
            const sphere = projection === sphereProjection;
            const eps = 1e-10;
            const target = new GeoCoordinates(52.5145, 13.3501);
            mapView = new MapView({
                ...mapViewOptions,
                target,
                tilt: 45,
                zoomLevel: 1,
                projection
            });
            for (let zoom = 1; zoom < 20; ++zoom) {
                mapView.zoomLevel = zoom;
                const center = mapView.getGeoCoordinatesAt(
                    canvas.clientWidth / 2,
                    canvas.clientHeight / 2
                );
                assert.isNotNull(center);
                assert.closeTo(center!.latitude, target.latitude, eps);
                assert.closeTo(center!.longitude, target.longitude, eps);
                assert.isDefined(center!.altitude);
                assert.closeTo(center!.altitude!, 0, sphere ? 1e-7 : 1e-10);

                const left = mapView.getGeoCoordinatesAt(0, canvas.clientHeight / 2);
                if (sphere && zoom < 10) {
                    // assert.isNull(left);
                } else {
                    assert.isNotNull(left);
                    if (sphere) {
                        assert.isBelow(left!.latitude, target.latitude);
                    } else {
                        assert.closeTo(left!.latitude, target.latitude, eps);
                    }
                    assert.isBelow(left!.longitude, target.longitude);
                    assert.isDefined(left!.altitude);
                    assert.closeTo(left!.altitude!, 0, sphere ? 1e-9 : eps);
                }
                const right = mapView.getGeoCoordinatesAt(
                    canvas.clientWidth,
                    canvas.clientHeight / 2
                );
                if (sphere) {
                    if (zoom < 10) {
                        // assert.isNull(right);
                    } else {
                        assert.isNotNull(right);
                        if (sphere) {
                            assert.isBelow(right!.latitude, target.latitude);
                        } else {
                            assert.closeTo(right!.latitude, target.latitude, eps);
                        }
                        assert.isAbove(right!.longitude, target.longitude);
                        assert.isDefined(right!.altitude);
                        assert.closeTo(right!.altitude!, 0, sphere ? 1e-9 : eps);
                    }
                } else {
                }
                const bottom = mapView.getGeoCoordinatesAt(
                    canvas.clientWidth / 2,
                    canvas.clientHeight
                );
                if (sphere) {
                    // assert.isNull(bottom);
                } else {
                    assert.isNotNull(bottom);
                    assert.isBelow(bottom!.latitude, target.latitude);
                    assert.closeTo(bottom!.longitude, target.longitude, eps);
                    assert.isDefined(bottom!.altitude);
                    assert.closeTo(bottom!.altitude!, 0, eps);
                }

                const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);
                if (sphere) {
                    // assert.isNull(top);
                } else {
                    assert.isNotNull(top);
                    assert.isAbove(top!.latitude, target.latitude);
                    assert.closeTo(top!.longitude, target.longitude, eps);
                    assert.isDefined(top!.altitude);
                    assert.closeTo(top!.altitude!, 0, eps);
                }
            }
        });
    });

    projections.forEach(projection => {
        const projectionName = getProjectionName(projection);

        it(`convert screen to geo north pole ${projectionName}`, async function () {
            const sphere = projection === sphereProjection;
            const target = new GeoCoordinates(
                THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE),
                0
            );
            const eps = 1e-10;

            mapView = new MapView({
                ...mapViewOptions,
                target,
                tilt: 45,
                zoomLevel: 10,
                projection
            });
            const center = mapView.getGeoCoordinatesAt(
                canvas.clientWidth / 2,
                canvas.clientHeight / 2
            );
            assert.isNotNull(center);
            assert.closeTo(center!.latitude, target.latitude, eps);
            assert.closeTo(center!.longitude, target.longitude, eps);
            assert.isDefined(center!.altitude);
            assert.closeTo(center!.altitude!, 0, sphere ? 1e-9 : eps);

            // Clicking "behind" the north pole should return the north pole.
            const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);

            assert.isNotNull(top);
            if (sphere) {
                // In globe we can go up to 90° latitude
                assert.isAbove(top!.latitude, target.latitude);
            } else {
                // FIXME: Latitude returned is bigger than MAXIMUM_LATITUDE
                assert.closeTo(top!.latitude, target.latitude, 0.05);
            }
            assert.closeTo(top!.longitude, target.longitude, eps);
            assert.isDefined(top!.altitude);
            assert.closeTo(top!.altitude!, 0, eps);
        });
    });

    projections.forEach(projection => {
        const projectionName = getProjectionName(projection);
        it(`convert screen to geo south pole ${projectionName}`, async function () {
            const sphere = projection === sphereProjection;
            const target = new GeoCoordinates(
                -THREE.MathUtils.radToDeg(MercatorConstants.MAXIMUM_LATITUDE),
                0
            );
            const eps = 1e-10;

            mapView = new MapView({
                ...mapViewOptions,
                target,
                tilt: 45,
                zoomLevel: 10,
                heading: 180,
                projection
            });
            const center = mapView.getGeoCoordinatesAt(
                canvas.clientWidth / 2,
                canvas.clientHeight / 2
            );
            assert.isNotNull(center);
            assert.closeTo(center!.latitude, target.latitude, eps);
            assert.closeTo(center!.longitude, target.longitude, eps);
            assert.isDefined(center!.altitude);
            assert.closeTo(center!.altitude!, 0, sphere ? 1e-9 : eps);

            // Clicking "behind" the south pole should return the south pole.
            const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);

            assert.isNotNull(top);
            if (sphere) {
                // In globe we can go down to -90° latitude
                assert.isBelow(top!.latitude, target.latitude);
            } else {
                // FIXME: Latitude returned is smaller than -MAXIMUM_LATITUDE
                assert.closeTo(top!.latitude, target.latitude, 0.05);
            }
            assert.closeTo(top!.longitude, target.longitude, eps);
            assert.isDefined(top!.altitude);
            assert.closeTo(top!.altitude!, 0, eps);
        });
    });

    projections.forEach(projection => {
        const projectionName = getProjectionName(projection);

        it(`convert screen to geo anti meridian east ${projectionName} wrapped`, async function () {
            const sphere = projection === sphereProjection;
            const target = new GeoCoordinates(0, 180);
            const eps = 1e-10;

            mapView = new MapView({
                ...mapViewOptions,
                target,
                tilt: 45,
                zoomLevel: 10,
                heading: 90,
                projection
            });
            const center = mapView.getGeoCoordinatesAt(
                canvas.clientWidth / 2,
                canvas.clientHeight / 2
            );
            assert.isNotNull(center);
            assert.closeTo(center!.latitude, target.latitude, eps);
            assert.closeTo(center!.longitude, target.longitude, eps);
            assert.isDefined(center!.altitude);
            assert.closeTo(center!.altitude!, 0, sphere ? 1e-9 : eps);

            // Clicking "behind" the anti-meridian should wrap around
            const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);

            assert.isNotNull(top);
            assert.closeTo(top!.latitude, target.latitude, eps);
            if (sphere) {
                assert.closeTo(top!.longitude, -179.53797274421527, eps);
            } else {
                // If tile wrapping is enabled we can get longitude > 180
                assert.isAbove(top!.longitude, target.longitude);
            }
            assert.isDefined(top!.altitude);
            assert.closeTo(top!.altitude!, 0, sphere ? 1e-9 : eps);
        });
    });

    projections.forEach(projection => {
        const projectionName = getProjectionName(projection);

        it(`convert screen to geo anti meridian west ${projectionName} wrapped`, async function () {
            const sphere = projection === sphereProjection;
            const target = new GeoCoordinates(0, -180);
            const eps = 1e-10;

            mapView = new MapView({
                ...mapViewOptions,
                target,
                tilt: 45,
                zoomLevel: 10,
                heading: -90,
                projection
            });
            const center = mapView.getGeoCoordinatesAt(
                canvas.clientWidth / 2,
                canvas.clientHeight / 2
            );
            assert.isNotNull(center);
            assert.closeTo(center!.latitude, target.latitude, eps);
            assert.closeTo(center!.longitude, target.longitude, eps);
            assert.isDefined(center!.altitude);
            assert.closeTo(center!.altitude!, 0, sphere ? 1e-9 : eps);

            // Clicking "behind" the anti-meridian should wrap around
            const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);

            assert.isNotNull(top);
            assert.closeTo(top!.latitude, target.latitude, eps);
            if (sphere) {
                assert.closeTo(top!.longitude, 179.53797274421527, eps);
            } else {
                // If tile wrapping is enabled we can get longitude < -180
                assert.isBelow(top!.longitude, target.longitude);
            }
            assert.isDefined(top!.altitude);
            assert.closeTo(top!.altitude!, 0, sphere ? 1e-9 : eps);
        });
    });

    it("convert screen to geo anti meridian east mercator not-wrapped", async function () {
        const target = new GeoCoordinates(0, 180);
        const eps = 1e-10;

        mapView = new MapView({
            ...mapViewOptions,
            target,
            tilt: 45,
            zoomLevel: 10,
            heading: 90,
            tileWrappingEnabled: false
        });
        const center = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, canvas.clientHeight / 2);
        assert.isNotNull(center);
        assert.closeTo(center!.latitude, target.latitude, eps);
        assert.closeTo(center!.longitude, target.longitude, eps);
        assert.isDefined(center!.altitude);
        assert.closeTo(center!.altitude!, 0, eps);

        // Clicking "behind" the anti-meridian should clamp
        const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);

        assert.isNotNull(top);
        assert.closeTo(top!.latitude, target.latitude, eps);
        assert.closeTo(top!.longitude, MAX_LONGITUDE, eps);
        assert.isDefined(top!.altitude);
        assert.closeTo(top!.altitude!, 0, eps);
    });

    it("convert screen to geo anti meridian west mercator not-wrapped", async function () {
        const target = new GeoCoordinates(0, -180);
        const eps = 1e-10;

        mapView = new MapView({
            ...mapViewOptions,
            target,
            tilt: 45,
            zoomLevel: 10,
            heading: -90,
            tileWrappingEnabled: false
        });
        const center = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, canvas.clientHeight / 2);
        assert.isNotNull(center);
        assert.closeTo(center!.latitude, target.latitude, eps);
        assert.closeTo(center!.longitude, target.longitude, eps);
        assert.isDefined(center!.altitude);
        assert.closeTo(center!.altitude!, 0, eps);

        // Clicking "behind" the anti-meridian should clamp
        const top = mapView.getGeoCoordinatesAt(canvas.clientWidth / 2, 0);

        assert.isNotNull(top);
        assert.closeTo(top!.latitude, target.latitude, eps);
        assert.closeTo(top!.longitude, MIN_LONGITUDE, eps);
        assert.isDefined(top!.altitude);
        assert.closeTo(top!.altitude!, 0, eps);
    });

    it("updates scene materials, objects & skips transparent ones", async function () {
        if (inNodeContext) {
            let time = 0;
            global.requestAnimationFrame = (callback: FrameRequestCallback) => {
                return setTimeout(() => {
                    callback(time++);
                    return 0;
                }, 0);
            };
            global.cancelAnimationFrame = (id: number) => {
                clearTimeout(id);
            };
        }
        const getSceneObjects = () => {
            const result: THREE.Object3D[] = [];
            mapView!.scene.traverse(obj => result.push(obj));
            return result;
        };

        const dataSource = new FakeOmvDataSource({ name: "omv" });
        mapView = new MapView({ ...mapViewOptions, theme: {} });
        await mapView.addDataSource(dataSource);

        //
        // Round zero - force MapView to create Tiles for current view
        //
        mapView.update();
        await waitForEvent(mapView, MapViewEventNames.AfterRender);

        const mapObjectAdapterEnsureUpdatedSpy = sandbox.spy(
            MapObjectAdapter.prototype,
            "ensureUpdated"
        );
        const mapMaterialAdapterEnsureUpdatedSpy = sandbox.spy(
            MapMaterialAdapter.prototype,
            "ensureUpdated"
        );

        // create dummy objects in currently selected tiles
        const objects: THREE.Object3D[] = [];
        const materials: THREE.Material[] = [];
        mapView.forEachCachedTile(tile => {
            if (tile.dataSource !== dataSource) {
                return;
            }
            const materialAdapter = MapMaterialAdapter.create(new THREE.MeshBasicMaterial(), {
                opacity: Expr.fromJSON(["get", "testOpacity", ["dynamic-properties"]])
            });
            materials.push(materialAdapter.material);
            const object = new THREE.Mesh(new THREE.BufferGeometry(), materialAdapter.material);
            tile.objects.push(object);
            MapObjectAdapter.create(object, {});
            objects.push(object);
        });

        //
        // First round: normal objects with some transparency but still visible
        //
        mapView.setDynamicProperty("testOpacity", 0.7);

        // update map, should call MapObjectAdapter.ensureUpdated for each object
        mapView.update();
        await waitForEvent(mapView, MapViewEventNames.AfterRender);
        const objectsInScene1 = getSceneObjects();
        assert.isAtLeast(mapObjectAdapterEnsureUpdatedSpy.callCount, objects.length);
        assert.isAtLeast(mapMaterialAdapterEnsureUpdatedSpy.callCount, materials.length);

        for (const material of materials) {
            assert.equal(material.opacity, 0.7);
        }
        for (const object of objects) {
            assert.equal(MapObjectAdapter.get(object)!.isVisible(), true);
            assert.include(objectsInScene1, object);
        }
        mapObjectAdapterEnsureUpdatedSpy.resetHistory();
        mapMaterialAdapterEnsureUpdatedSpy.resetHistory();

        //
        // Third round: all objects are transparent so should be skipped1
        //
        mapView.setDynamicProperty("testOpacity", 0);
        mapView.update();
        await waitForEvent(mapView, MapViewEventNames.AfterRender);

        assert.isAtLeast(mapObjectAdapterEnsureUpdatedSpy.callCount, objects.length);
        assert.isAtLeast(mapMaterialAdapterEnsureUpdatedSpy.callCount, materials.length);

        const objectsInScene2 = getSceneObjects();

        for (const material of materials) {
            assert.equal(material.opacity, 0);
        }

        for (const object of objects) {
            assert.equal(MapObjectAdapter.get(object)!.isVisible(), false);
            assert.notInclude(objectsInScene2, object);
        }
    });

    it("updates background storage level offset", async function () {
        if (inNodeContext) {
            global.requestAnimationFrame = (callback: FrameRequestCallback) => {
                return setTimeout(() => {
                    // avoid camera movement events, needed setup is not done.
                    if (mapView !== undefined) {
                        mapView.cameraMovementDetector.clear(mapView);
                    }
                    callback(0);
                    return 0;
                }, 0);
            };
            global.cancelAnimationFrame = (id: number) => {
                clearTimeout(id);
            };
        }
        mapView = new MapView({ canvas, theme: {} });
        await mapView.getTheme();

        const dataSource = new FakeOmvDataSource({ name: "omv" });

        await mapView.addDataSource(dataSource);

        const backgroundDataSource = mapView.getDataSourceByName(
            "background"
        ) as BackgroundDataSource;
        assert.isDefined(backgroundDataSource);
        const updateStorageOffsetSpy = sinon.spy(backgroundDataSource, "updateStorageLevelOffset");

        mapView.update();
        await waitForEvent(mapView, MapViewEventNames.AfterRender);

        expect(updateStorageOffsetSpy.called);
    });

    it("languages set in MapView are also set in datasources", async function () {
        const dataSource = new FakeOmvDataSource({ name: "omv" });
        mapView = new MapView({ ...mapViewOptions, theme: {} });
        await mapView.getTheme();

        await mapView.addDataSource(dataSource);
        mapView.languages = ["Goblin"];

        assert.isDefined(dataSource.getLanguages());
        assert.equal(dataSource.getLanguages()!.length, 1, "No language set in datasource");
        assert.equal(dataSource.getLanguages()![0], "Goblin", "Wrong language set in datasource");
    });

    it("languages set in MapView are also set in datasources added later", async function () {
        const dataSource = new FakeOmvDataSource({ name: "omv" });
        mapView = new MapView({ ...mapViewOptions, theme: {} });
        await mapView.getTheme();

        mapView.languages = ["Goblin"];
        await mapView.addDataSource(dataSource);

        assert.isDefined(dataSource.getLanguages());
        assert.equal(dataSource.getLanguages()!.length, 1, "No language set in datasource");
        assert.equal(dataSource.getLanguages()![0], "Goblin", "Wrong language set in datasource");
    });

    describe("elevation source", function () {
        let fakeElevationSource: DataSource;
        let fakeElevationRangeSource: ElevationRangeSource;
        let fakeElevationProvider: ElevationProvider;
        beforeEach(function () {
            fakeElevationSource = {
                name: "terrain",
                attach(mapView: MapView) {
                    this.mapView = mapView;
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
                    maxElevation: 100,
                    calculationStatus: CalculationStatus.FinalPrecise
                })
            } as any;
            fakeElevationProvider = {
                clearCache() {},
                getHeight: () => 0
            } as any;
        });

        describe("setElevationSource", function () {
            it("can add an elevation source", async function () {
                mapView = new MapView(mapViewOptions);
                await mapView.setElevationSource(
                    fakeElevationSource,
                    fakeElevationRangeSource,
                    fakeElevationProvider
                );
                expect(mapView)
                    .to.have.property("m_elevationSource")
                    .that.equals(fakeElevationSource);
                expect(mapView)
                    .to.have.property("m_tileDataSources")
                    .that.has.length(1)
                    .and.includes(fakeElevationSource);
                expect(mapView)
                    .to.have.property("m_elevationRangeSource")
                    .that.equals(fakeElevationRangeSource);
                expect(mapView)
                    .to.have.property("m_elevationProvider")
                    .that.equals(fakeElevationProvider);
                expect(fakeElevationSource.mapView).to.equal(mapView);
            });
            it("can replace an elevation source", async function () {
                const secondElevationSource: DataSource = {
                    ...fakeElevationSource
                } as any;

                mapView = new MapView(mapViewOptions);
                await mapView.setElevationSource(
                    fakeElevationSource,
                    fakeElevationRangeSource,
                    fakeElevationProvider
                );
                expect(mapView)
                    .to.have.property("m_elevationSource")
                    .that.equals(fakeElevationSource);
                expect(mapView)
                    .to.have.property("m_tileDataSources")
                    .that.has.length(1)
                    .and.includes(fakeElevationSource);

                await mapView.setElevationSource(
                    secondElevationSource,
                    fakeElevationRangeSource,
                    fakeElevationProvider
                );

                expect(mapView)
                    .to.have.property("m_elevationSource")
                    .that.equals(secondElevationSource);
                expect(mapView)
                    .to.have.property("m_tileDataSources")
                    .that.has.length(1)
                    .and.includes(secondElevationSource)
                    .and.does.not.include(fakeElevationSource);
                expect(mapView)
                    .to.have.property("m_elevationRangeSource")
                    .that.equals(fakeElevationRangeSource);
                expect(mapView)
                    .to.have.property("m_elevationProvider")
                    .that.equals(fakeElevationProvider);
                expect(fakeElevationSource.mapView).to.be.undefined;
                expect(secondElevationSource.mapView).to.equal(mapView);
            });
        });

        describe("clearElevationSource", function () {
            it("removes an elevation source", async function () {
                mapView = new MapView(mapViewOptions);
                await mapView.setElevationSource(
                    fakeElevationSource,
                    fakeElevationRangeSource,
                    fakeElevationProvider
                );
                mapView.clearElevationSource(fakeElevationSource);

                expect(mapView).to.have.property("m_elevationSource").that.is.undefined;
                expect(mapView)
                    .to.have.property("m_tileDataSources")
                    .that.has.length(0)
                    .and.does.not.include(fakeElevationSource);
                expect(mapView).to.have.property("m_elevationRangeSource").that.is.undefined;
                expect(mapView).to.have.property("m_elevationProvider").that.is.undefined;
                expect(fakeElevationSource.mapView).to.be.undefined;
            });
        });
    });

    describe("theme", function () {
        const sampleThemeUrl = getTestResourceUrl(
            "@here/harp-mapview",
            "test/resources/baseTheme.json"
        );

        it("loads a default theme", async function () {
            mapView = new MapView(mapViewOptions);
            await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);
            expect(await mapView.getTheme()).to.deep.equal({
                clearAlpha: undefined,
                clearColor: undefined,
                defaultTextStyle: undefined,
                definitions: undefined,
                fog: undefined,
                fontCatalogs: undefined,
                imageTextures: undefined,
                images: undefined,
                lights: undefined,
                poiTables: undefined,
                sky: undefined,
                styles: {},
                textStyles: undefined
            });
        });

        it("loads theme from url", async function () {
            mapView = new MapView({
                ...mapViewOptions,
                theme: sampleThemeUrl
            });
            const theme = await mapView.getTheme();

            expect(theme.styles).to.not.be.empty;
        });

        it("loads a 'flat' theme ", async function () {
            mapView = new MapView({
                ...mapViewOptions,
                theme: {
                    styles: [
                        {
                            technique: "none",
                            styleSet: "tilezen"
                        }
                    ]
                }
            });

            const theme = await mapView.getTheme();
            expect(theme.styles).to.not.be.empty;
            expect(theme.styles?.tilezen).to.not.be.undefined;
        });

        it("allows to reset theme", async function () {
            mapView = new MapView({
                ...mapViewOptions,
                theme: sampleThemeUrl
            });
            await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);

            expect(mapView.getTheme()).to.not.deep.equal({
                clearColor: undefined,
                defaultTextStyle: undefined,
                definitions: undefined,
                fog: undefined,
                fontCatalogs: undefined,
                imageTextures: undefined,
                images: undefined,
                lights: undefined,
                poiTables: undefined,
                sky: undefined,
                styles: {},
                textStyles: undefined
            });

            await mapView.setTheme({});
            mapView.getTheme().then(theme =>
                expect(theme).to.deep.equal({
                    clearAlpha: undefined,
                    clearColor: undefined,
                    defaultTextStyle: undefined,
                    definitions: undefined,
                    fog: undefined,
                    fontCatalogs: undefined,
                    imageTextures: undefined,
                    images: undefined,
                    lights: undefined,
                    poiTables: undefined,
                    sky: undefined,
                    styles: {},
                    textStyles: undefined
                })
            );
        });
    });

    describe("frame complete", function () {
        it("MapView emits frame complete for empty map", async function () {
            this.timeout(100);
            mapView = new MapView(mapViewOptions);
            return await waitForEvent(mapView, MapViewEventNames.FrameComplete);
        });
        it("MapView emits frame complete after map initialized", async function () {
            this.timeout(100);
            mapView = new MapView(mapViewOptions);

            const dataSource = new FakeOmvDataSource({ name: "omv" });
            mapView.addDataSource(dataSource);

            return await waitForEvent(mapView, MapViewEventNames.FrameComplete);
        });
        it("MapView emits frame complete again after map update", async function () {
            this.timeout(100);
            mapView = new MapView(mapViewOptions);

            const dataSource = new FakeOmvDataSource({ name: "omv" });
            mapView.addDataSource(dataSource);

            await waitForEvent(mapView, MapViewEventNames.FrameComplete);

            mapView.update();
            return await waitForEvent(mapView, MapViewEventNames.FrameComplete);
        });
    });

    it("markTilesDirty proxies call to VisibleTileSet", () => {
        const markTilesDirtySpy = sinon.spy(VisibleTileSet.prototype, "markTilesDirty");
        mapView = new MapView(mapViewOptions);
        const dataSource = new FakeOmvDataSource({ name: "omv" });
        const tileFilter = () => true;
        mapView.markTilesDirty(dataSource, tileFilter);

        expect(markTilesDirtySpy.calledWith(dataSource, tileFilter)).to.be.true;
    });

    it("projection setter disposes of old tile resources", () => {
        const mapView = new MapView(mapViewOptions);
        const oldVisibleTileSet = mapView.visibleTileSet;
        const clearCacheSpy = sinon.spy(oldVisibleTileSet, "clearTileCache");
        const disposeSpy = sinon.spy(oldVisibleTileSet, "disposePendingTiles");

        mapView.projection = sphereProjection;

        expect(mapView.visibleTileSet).not.equals(oldVisibleTileSet);
        expect(clearCacheSpy.called).to.be.true;
        expect(disposeSpy.called).to.be.true;
    });
});
