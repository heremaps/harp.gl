/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { GeoCoordinates } from "@here/geoutils";
import { MapView, MapViewEventNames } from "../lib/MapView";
import { MapViewFog } from "../lib/MapViewFog";
import { MapViewUtils } from "../lib/Utils";

import { FontCatalog } from "@here/text-renderer";
import { FakeOmvDataSource } from "./FakeOmvDataSource";

describe("MapView", () => {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let webGlStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let fontStub: sinon.SinonStub;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        clearColorStub = sandbox.stub();
        webGlStub = sandbox.stub(THREE, "WebGLRenderer").returns({
            getClearColor: () => undefined,
            setClearColor: clearColorStub,
            setSize: () => undefined,
            setPixelRatio: () => undefined,
            render: () => undefined,
            dispose: () => undefined,
            info: { autoReset: true, reset: () => undefined }
        });
        fontStub = sandbox.stub(FontCatalog, "load").returns(new Promise(() => {}));
        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = () => {};
        }
    });

    afterEach(() => {
        sandbox.restore();
        if (inNodeContext) {
            delete (global as any).window;
            delete (global as any).requestAnimationFrame;
            delete (global as any).navigator;
        }
    });

    it("Correctly sets geolocation and zoom", () => {
        let mapView: MapView;
        let coords: GeoCoordinates;
        let postionSpy: sinon.SinonSpy;
        let rotationSpy: sinon.SinonSpy;
        let zoomSpy: sinon.SinonSpy;

        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.requestAnimationFrame = () => {};
        }

        const canvas = { width: 0, height: 0, addEventListener: () => {} };
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

    it("Correctly sets event listeners and handlers webgl context restored", () => {
        const canvas = { width: 0, height: 0, addEventListener: () => {} };
        const addEventListenerSpy = sinon.spy(canvas, "addEventListener");
        const mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
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

    it("Correctly sets and removes event listeners by API", () => {
        const canvas = { width: 0, height: 0, addEventListener: () => {} };
        const mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
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

    it("supports #dispose", async () => {
        const canvas = {
            width: 0,
            height: 0,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        const dataSource = new FakeOmvDataSource();
        const dataSourceDisposeStub = sinon.stub(dataSource, "dispose");
        mapView.addDataSource(dataSource);
        await dataSource.connect();

        mapView.dispose();

        expect(dataSourceDisposeStub.callCount).to.be.equal(1);
        expect(canvas.addEventListener.callCount).to.be.equal(2);
        expect(canvas.removeEventListener.callCount).to.be.equal(2);
    });

    it("checks fov limits when camera is updated", async () => {
        let canvas = {
            width: 100,
            height: 1000,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        let mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        mapView.resize(100, 1000);

        expect(mapView.fov).to.be.closeTo(82.36449238608574, 0.00000000001);

        canvas = {
            width: 1000,
            height: 100,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        mapView.resize(1000, 100);

        expect(mapView.fov).to.be.closeTo(30.725626488233594, 0.00000000001);
    });

    it("returns the fog through #fog getter", () => {
        const canvas = {
            width: 0,
            height: 0,
            addEventListener: sinon.stub(),
            removeEventListener: sinon.stub()
        };
        const mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        expect(mapView.fog instanceof MapViewFog).to.equal(true);
    });
});
