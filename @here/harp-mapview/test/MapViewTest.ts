/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
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
import * as sinon from "sinon";
import * as THREE from "three";

import { GeoCoordinates } from "@here/harp-geoutils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { MapView, MapViewEventNames } from "../lib/MapView";
import { MapViewFog } from "../lib/MapViewFog";
import { MapViewUtils } from "../lib/Utils";

import { waitForEvent } from "@here/harp-test-utils";
import { FontCatalog } from "@here/harp-text-canvas";
import { BackgroundDataSource } from "../lib/BackgroundDataSource";
import { FakeVectorTileDataSource } from "./FakeVectorTileDataSource";

declare const global: any;

describe("MapView", function() {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let webGlStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let fontStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    let mapView: MapView | undefined;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        webGlStub = sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        fontStub = sandbox.stub(FontCatalog, "load").returns(new Promise(() => {}));
        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = () => {};
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
        let rotationSpy: sinon.SinonSpy;
        let zoomSpy: sinon.SinonSpy;

        rotationSpy = sinon.spy(MapViewUtils, "setRotation");
        zoomSpy = sinon.spy(MapViewUtils, "zoomOnTargetPosition");

        mapView = new MapView({ canvas });
        mapView.setCameraGeolocationAndZoom(coords, 18, 10, 20);

        expect(zoomSpy.calledOnce).to.be.true;
        expect(zoomSpy.calledWith(mapView, 0, 0, 18)).to.be.true;
        expect(rotationSpy.calledOnce).to.be.true;
        expect(rotationSpy.calledWith(mapView, 10, 20)).to.be.true;
        expect(mapView.geoCenter.latitude).to.be.closeTo(coords.latitude, 0.000000000001);
        expect(mapView.geoCenter.longitude).to.be.closeTo(coords.longitude, 0.000000000001);
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
        const dataSource = new FakeVectorTileDataSource();
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

                expect(resultA!.x).to.be.equal(resultB!.x);
                expect(resultA!.y).to.be.equal(resultB!.y);
                expect(resultA!.x).to.be.closeTo(x, 0.00000001);
                expect(resultA!.y).to.be.closeTo(y, 0.00000001);
                mapView.dispose();
                mapView = undefined;
            }
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

        const dataSource = new FakeVectorTileDataSource();

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
});
