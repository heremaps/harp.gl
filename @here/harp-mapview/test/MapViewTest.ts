/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import * as THREE from "three";
import * as nodeUrl from "url";
const URL = typeof window !== "undefined" ? window.URL : nodeUrl.URL;

import {
    GeoCoordinates,
    mercatorProjection,
    sphereProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { MapView, MapViewEventNames } from "../lib/MapView";
import { MapViewFog } from "../lib/MapViewFog";
import { MapViewUtils } from "../lib/Utils";

import { Expr } from "@here/harp-datasource-protocol";
import { getTestResourceUrl, waitForEvent } from "@here/harp-test-utils";
import { FontCatalog } from "@here/harp-text-canvas";
import { getAppBaseUrl } from "@here/harp-utils";
import { BackgroundDataSource } from "../lib/BackgroundDataSource";
import { DataSource } from "../lib/DataSource";
import { ElevationProvider } from "../lib/ElevationProvider";
import { CalculationStatus, ElevationRangeSource } from "../lib/ElevationRangeSource";
import { MapMaterialAdapter } from "../lib/MapMaterialAdapter";
import { MapObjectAdapter } from "../lib/MapObjectAdapter";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

declare const global: any;

function makeUrlRelative(baseUrl: string, url: string) {
    const baseUrlParsed = new URL(baseUrl);
    const urlParsed = new URL(url, baseUrl);

    if (urlParsed.origin !== baseUrlParsed.origin) {
        throw new Error("getRelativeUrl: origin mismatch");
    }
    if (urlParsed.protocol !== baseUrlParsed.protocol) {
        throw new Error("getRelativeUrl: protocol mismatch");
    }
    return path.relative(baseUrlParsed.pathname, urlParsed.pathname);
}

describe("MapView", function() {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    let mapView: MapView | undefined;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        // tslint:disable-next-line:no-unused-variable
        const webGlStub = sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        // tslint:disable-next-line:no-unused-variable
        const fontStub = sandbox.stub(FontCatalog, "load").returns(new Promise(() => {}));
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
    });

    afterEach(function() {
        if (mapView !== undefined) {
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
    // it offsets actual `geoCenter` a litte.
    //
    // TODO: check who is right? this test or `setCameraGeolocationAndZoom` implementation
    //
    it.skip("Correctly sets geolocation and zoom", function() {
        const coords: GeoCoordinates = new GeoCoordinates(52.5145, 13.3501);

        const rotationSpy = sinon.spy(MapViewUtils, "setRotation");
        const zoomSpy = sinon.spy(MapViewUtils, "zoomOnTargetPosition");

        mapView = new MapView({ canvas });
        // tslint:disable-next-line: deprecation
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
        describe(`camera positioning - ${projectionName} projection`, function() {
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
                }
            ]) {
                it(`obeys constructor params - ${testName}`, function() {
                    mapView = new MapView({
                        canvas,
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
                it(`obeys #lookAt params - ${testName}`, function() {
                    mapView = new MapView({
                        canvas,
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
                });
            }
        });
    }
    it("Correctly sets target and zoom from options in constructor", function() {
        mapView = new MapView({
            canvas,
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

    // tslint:disable-next-line: max-line-length
    it("Correctly sets geolocation and zoom from options in constructor with sphere projection", function() {
        mapView = new MapView({
            canvas,
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

    it("Correctly set and get zoom", function() {
        mapView = new MapView({
            canvas,
            tilt: 45,
            heading: 90
        });

        for (let i = 1; i <= 20; i += 0.1) {
            mapView.zoomLevel = i;
            expect(mapView.zoomLevel).to.be.closeTo(i, 1e-10);
        }
    });

    it("Correctly clamp zoom", function() {
        mapView = new MapView({
            canvas
        });

        mapView.zoomLevel = 0;
        expect(mapView.zoomLevel).to.be.equal(1);

        mapView.zoomLevel = 21;
        expect(mapView.zoomLevel).to.be.equal(20);
    });

    it("Distance bigger than lowest zoomLevel", function() {
        mapView = new MapView({
            canvas
        });

        mapView.zoomLevel = 1;
        const distance = mapView.targetDistance * 2;
        mapView.lookAt({ distance });
        expect(mapView.targetDistance).to.be.equal(distance);
        expect(mapView.zoomLevel).to.be.equal(1);
    });

    it("Distance lower than highest zoomLevel", function() {
        mapView = new MapView({
            canvas
        });

        mapView.zoomLevel = 20;
        const distance = mapView.targetDistance / 2;
        mapView.lookAt({ distance });
        expect(mapView.targetDistance).to.be.equal(distance);
        expect(mapView.zoomLevel).to.be.equal(20);
    });

    it("Correctly set and get tilt", function() {
        const zoomLevel = 10;
        mapView = new MapView({
            canvas,
            zoomLevel
        });

        for (let tilt = 0; tilt < 89; tilt += 1.0) {
            mapView.tilt = tilt;
            expect(mapView.zoomLevel).to.be.closeTo(zoomLevel, 1e-10);
            expect(mapView.tilt).to.be.closeTo(tilt, 1e-10);
        }
    });

    it("Correctly sets geolocation with GeoPointLike as parameter in constructor", function() {
        mapView = new MapView({
            canvas,
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

    // tslint:disable-next-line: max-line-length
    it("Correctly sets geolocation with GeoCoordinatesLike as parameter in constructor", function() {
        mapView = new MapView({
            canvas,
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

    it("Correctly sets geolocation with LatLngLike as parameter in constructor", function() {
        mapView = new MapView({
            canvas,
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

    it("Correctly sets geolocation with GeoPointLike", function() {
        mapView = new MapView({
            canvas
        });

        mapView.lookAt({
            target: [13.3501, 52.5145]
        });
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
    });

    // tslint:disable-next-line: max-line-length
    it("Correctly sets target with GeoCoordinatesLike", function() {
        mapView = new MapView({
            canvas
        });

        mapView.lookAt({
            target: {
                latitude: 52.5145,
                longitude: 13.3501
            }
        });
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
    });

    it("Correctly sets target with LatLngLike", function() {
        mapView = new MapView({
            canvas
        });

        mapView.lookAt({
            target: {
                lat: 52.5145,
                lng: 13.3501
            }
        });
        expect(mapView.target.latitude).to.be.closeTo(52.5145, 1e-13);
        expect(mapView.target.longitude).to.be.closeTo(13.3501, 1e-13);
    });

    it("Correctly set and get distance", function() {
        mapView = new MapView({
            canvas,
            tilt: 45,
            heading: 90
        });

        for (let distance = 100; distance <= 20000000; distance *= 2) {
            mapView.lookAt({ distance });
            expect(mapView.targetDistance).to.be.closeTo(distance, 1e-8);
        }
    });

    it("Correctly sets event listeners and handlers webgl context restored", function() {
        mapView = new MapView({ canvas });
        const updateSpy = sinon.spy(mapView, "update");

        expect(addEventListenerSpy.callCount).to.be.equal(2);
        expect(addEventListenerSpy.callCount).to.be.equal(2);
        expect(addEventListenerSpy.getCall(0).args[0]).to.be.equal("webglcontextlost");
        expect(!!addEventListenerSpy.getCall(0).args[1]).to.be.equal(true);
        expect(addEventListenerSpy.getCall(1).args[0]).to.be.equal("webglcontextrestored");
        expect(!!addEventListenerSpy.getCall(1).args[1]).to.be.equal(true);

        const webGlContextRestoredHandler = addEventListenerSpy.getCall(1).args[1];
        const webGlContextLostHandler = addEventListenerSpy.getCall(0).args[1];

        const dispatchEventSpy = sinon.spy(mapView, "dispatchEvent");
        // @ts-ignore: Conversion to Theme type
        mapView.m_theme = {};
        // @ts-ignore: Conversion to Number type
        mapView.m_theme.clearColor = 0xffffff;
        webGlContextRestoredHandler();
        // @ts-ignore: Conversion to undefined
        mapView.m_theme.clearColor = undefined;
        webGlContextRestoredHandler();
        webGlContextLostHandler();

        expect(clearColorStub.callCount).to.be.equal(3);
        expect(clearColorStub.getCall(0).calledWith(0xefe9e1)).to.be.equal(true);
        expect(clearColorStub.getCall(1).args[0].r).to.be.equal(1);
        expect(clearColorStub.getCall(1).args[0].g).to.be.equal(1);
        expect(clearColorStub.getCall(1).args[0].b).to.be.equal(1);
        expect(clearColorStub.getCall(2).calledWith(0xefe9e1)).to.be.equal(true);

        expect(updateSpy.callCount).to.be.equal(2);
        expect(dispatchEventSpy.callCount).to.be.equal(5);
        expect(dispatchEventSpy.getCall(0).args[0].type).to.be.equal(
            MapViewEventNames.ContextRestored
        );
        expect(dispatchEventSpy.getCall(1).args[0].type).to.be.equal(MapViewEventNames.Update);
        expect(dispatchEventSpy.getCall(2).args[0].type).to.be.equal(
            MapViewEventNames.ContextRestored
        );
        expect(dispatchEventSpy.getCall(3).args[0].type).to.be.equal(MapViewEventNames.Update);
        expect(dispatchEventSpy.getCall(4).args[0].type).to.be.equal(MapViewEventNames.ContextLost);
    });

    it("Correctly sets and removes event listeners by API", function() {
        mapView = new MapView({ canvas });

        const restoreStub = sinon.stub();
        const lostStub = sinon.stub();

        mapView.addEventListener(MapViewEventNames.ContextLost, lostStub);
        mapView.addEventListener(MapViewEventNames.ContextRestored, restoreStub);
        mapView.dispatchEvent({ type: MapViewEventNames.ContextLost });
        mapView.dispatchEvent({ type: MapViewEventNames.ContextRestored });

        expect(restoreStub.callCount).to.be.equal(1);
        expect(lostStub.callCount).to.be.equal(1);

        mapView.removeEventListener(MapViewEventNames.ContextLost, lostStub);
        mapView.removeEventListener(MapViewEventNames.ContextRestored, restoreStub);
        mapView.dispatchEvent({ type: MapViewEventNames.ContextRestored });
        mapView.dispatchEvent({ type: MapViewEventNames.ContextLost });

        expect(restoreStub.callCount).to.be.equal(1);
        expect(lostStub.callCount).to.be.equal(1);
    });

    it("supports #dispose", async function() {
        const dataSource = new FakeOmvDataSource({ name: "omv" });
        const dataSourceDisposeStub = sinon.stub(dataSource, "dispose");
        mapView = new MapView({ canvas });
        mapView.addDataSource(dataSource);
        await dataSource.connect();

        mapView.dispose();

        expect(dataSourceDisposeStub.callCount).to.be.equal(1);
        expect(addEventListenerSpy.callCount).to.be.equal(2);
        expect(removeEventListenerSpy.callCount).to.be.equal(2);
        mapView = undefined!;
    });

    it("maintains vertical fov limit", function() {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "fixed", fov }
        });
        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("maintains horizontal fov limit", function() {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "fixed", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that the FOV doesn't change
        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("changes vertical fov when resizing with dynamic fov", function() {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "dynamic", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that resizing height changes the FOV (because we specified a dynamic calculation)
        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.not.eq(fov);
    });

    it("not changes horizontal fov when resizing with focal length", function() {
        const customCanvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (customCanvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "dynamic", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that resizing width keeps the FOV constant with dynamic fov.
        mapView.resize(101, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("returns the fog through #fog getter", function() {
        mapView = new MapView({ canvas });
        expect(mapView.fog instanceof MapViewFog).to.equal(true);
    });

    it("converts screen coords to geo to screen", function() {
        const customCanvas = {
            clientWidth: 1920,
            clientHeight: 1080,
            pixelRatio: 1,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };

        for (let x = -100; x <= 100; x += 100) {
            for (let y = -100; y <= 100; y += 100) {
                mapView = new MapView({ canvas: (customCanvas as any) as HTMLCanvasElement });
                const resultA = mapView.getScreenPosition(mapView.getGeoCoordinatesAt(x, y)!);
                mapView.dispose();

                customCanvas.pixelRatio = 2;
                mapView = new MapView({ canvas: (customCanvas as any) as HTMLCanvasElement });
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
    it("updates scene materials, objects & skips transparent ones", async function() {
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
        mapView = new MapView({ canvas, theme: {} });
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

    it("updates background storage level offset", async function() {
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
        mapView = new MapView({ canvas });
        mapView.theme = {};

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

    describe("elevation source", function() {
        let fakeElevationSource: DataSource;
        let fakeElevationRangeSource: ElevationRangeSource;
        let fakeElevationProvider: ElevationProvider;
        beforeEach(function() {
            fakeElevationSource = {
                name: "terrain",
                // tslint:disable-next-line: no-shadowed-variable
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

        describe("setElevationSource", function() {
            it("can add an elevation source", async function() {
                mapView = new MapView({ canvas });
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
                    .that.has.length(2)
                    .and.includes(fakeElevationSource);
                expect(mapView)
                    .to.have.property("m_elevationRangeSource")
                    .that.equals(fakeElevationRangeSource);
                expect(mapView)
                    .to.have.property("m_elevationProvider")
                    .that.equals(fakeElevationProvider);
                expect(fakeElevationSource.mapView).to.equal(mapView);
            });
            it("can replace an elevation source", async function() {
                const secondElevationSource: DataSource = {
                    ...fakeElevationSource
                } as any;

                mapView = new MapView({ canvas });
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
                    .that.has.length(2)
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
                    .that.has.length(2)
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

        describe("clearElevationSource", function() {
            it("removes an elevation source", async function() {
                mapView = new MapView({ canvas });
                await mapView.setElevationSource(
                    fakeElevationSource,
                    fakeElevationRangeSource,
                    fakeElevationProvider
                );
                mapView.clearElevationSource(fakeElevationSource);

                expect(mapView).to.have.property("m_elevationSource").that.is.undefined;
                expect(mapView)
                    .to.have.property("m_tileDataSources")
                    .that.has.length(1)
                    .and.does.not.include(fakeElevationSource);
                expect(mapView).to.have.property("m_elevationRangeSource").that.is.undefined;
                expect(mapView).to.have.property("m_elevationProvider").that.is.undefined;
                expect(fakeElevationSource.mapView).to.be.undefined;
            });
        });
    });

    describe("theme", function() {
        const appBaseUrl = getAppBaseUrl();
        const sampleThemeUrl = getTestResourceUrl(
            "@here/harp-mapview",
            "test/resources/baseTheme.json"
        );

        it("loads a default theme", async function() {
            mapView = new MapView({ canvas });
            await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);
            expect(mapView.theme).to.deep.equal({
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

        it("loads theme from url", async function() {
            const relativeToAppUrl = makeUrlRelative(appBaseUrl, sampleThemeUrl);

            mapView = new MapView({
                canvas,
                theme: relativeToAppUrl
            });
            await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);

            expect(mapView.theme.styles).to.not.be.empty;
        });

        it("allows to reset theme", async function() {
            const relativeToAppUrl = makeUrlRelative(appBaseUrl, sampleThemeUrl);

            mapView = new MapView({
                canvas,
                theme: relativeToAppUrl
            });
            await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);

            expect(mapView.theme).to.not.deep.equal({
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

            mapView.theme = {};
            expect(mapView.theme).to.deep.equal({
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
    });

    describe("frame complete", function() {
        it("MapView emits frame complete for empty map", async function() {
            this.timeout(100);
            mapView = new MapView({ canvas });
            return waitForEvent(mapView, MapViewEventNames.FrameComplete);
        });
        it("MapView emits frame complete after map initialized", async function() {
            this.timeout(100);
            mapView = new MapView({ canvas });

            const dataSource = new FakeOmvDataSource({ name: "omv" });
            mapView.addDataSource(dataSource);

            return waitForEvent(mapView, MapViewEventNames.FrameComplete);
        });
    });
});
