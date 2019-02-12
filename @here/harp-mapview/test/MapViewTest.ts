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

import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { GeoCoordinates } from "@here/harp-geoutils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { MapView, MapViewEventNames } from "../lib/MapView";
import { MapViewFog } from "../lib/MapViewFog";
import { MapViewUtils } from "../lib/Utils";

import { FontCatalog } from "@here/harp-text-canvas";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

declare const global: any;

describe("MapView", function() {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let webGlStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let fontStub: sinon.SinonStub;
    let mapView: MapView;
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
    });

    afterEach(function() {
        if (mapView !== undefined) {
            mapView.dispose();
        }
        sandbox.restore();
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.navigator;
        }
    });

    it("Correctly sets geolocation and zoom", function() {
        let coords: GeoCoordinates;
        let postionSpy: sinon.SinonSpy;
        let rotationSpy: sinon.SinonSpy;
        let zoomSpy: sinon.SinonSpy;

        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.requestAnimationFrame = () => {};
        }

        const canvas = {
            clientWidth: 0,
            clientHeight: 0,
            addEventListener: () => {},
            removeEventListener: () => {}
        };
        mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        coords = new GeoCoordinates(52.5145, 13.3501);

        postionSpy = sinon.spy(mapView.camera.position, "set");
        rotationSpy = sinon.spy(MapViewUtils, "setRotation");
        zoomSpy = sinon.spy(MapViewUtils, "zoomOnTargetPosition");

        mapView.setCameraGeolocationAndZoom(coords, 18, 10, 20);

        expect(postionSpy.calledOnce).to.be.true;
        expect(postionSpy.calledWith(0, 0, 0)).to.be.true;
        expect(zoomSpy.calledOnce).to.be.true;
        expect(zoomSpy.calledWith(mapView, 0, 0, 18)).to.be.true;
        expect(rotationSpy.calledOnce).to.be.true;
        expect(rotationSpy.calledWith(mapView, 10, 20)).to.be.true;
        expect(mapView.geoCenter.latitude).to.be.closeTo(coords.latitude, 0.000000000001);
        expect(mapView.geoCenter.longitude).to.be.closeTo(coords.longitude, 0.000000000001);
    });

    it("Correctly sets event listeners and handlers webgl context restored", function() {
        const canvas = {
            clientWidth: 0,
            clientHeight: 0,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        const addEventListenerSpy = canvas.addEventListener;
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
        expect(dispatchEventSpy.callCount).to.be.equal(3);
        expect(dispatchEventSpy.getCall(0).args[0].type).to.be.equal(
            MapViewEventNames.ContextRestored
        );
        expect(dispatchEventSpy.getCall(1).args[0].type).to.be.equal(
            MapViewEventNames.ContextRestored
        );
        expect(dispatchEventSpy.getCall(2).args[0].type).to.be.equal(MapViewEventNames.ContextLost);
    });

    it("Correctly sets and removes event listeners by API", function() {
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
        const canvas = {
            clientWidth: 0,
            clientHeight: 0,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        const dataSource = new FakeOmvDataSource();
        const dataSourceDisposeStub = sinon.stub(dataSource, "dispose");
        mapView.addDataSource(dataSource);
        await dataSource.connect();

        mapView.dispose();

        expect(dataSourceDisposeStub.callCount).to.be.equal(1);
        expect(canvas.addEventListener.callCount).to.be.equal(2);
        expect(canvas.removeEventListener.callCount).to.be.equal(2);
        mapView = undefined!;
    });

    it("maintains vertical fov limit", function() {
        const canvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (canvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "fixed", fov }
        });
        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("maintains horizontal fov limit", function() {
        const canvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (canvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "fixed", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that the FOV doesn't change
        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("changes vertical fov when resizing with dynamic fov", function() {
        const canvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (canvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "dynamic", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that resizing height changes the FOV (because we specified a dynamic calculation)
        mapView.resize(100, 101);
        expect(mapView.camera.fov).to.be.not.eq(fov);
    });

    it("not changes horizontal fov when resizing with focal length", function() {
        const canvas = {
            clientWidth: 100,
            clientHeight: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const fov = 45;
        mapView = new MapView({
            canvas: (canvas as any) as HTMLCanvasElement,
            fovCalculation: { type: "dynamic", fov }
        });

        mapView.resize(100, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);

        // Check that resizing width keeps the FOV constant with dynamic fov.
        mapView.resize(101, 100);
        expect(mapView.camera.fov).to.be.closeTo(fov, 0.00000000001);
    });

    it("returns the fog through #fog getter", function() {
        const canvas = {
            clientWidth: 0,
            clientHeight: 0,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        expect(mapView.fog instanceof MapViewFog).to.equal(true);
    });
});
