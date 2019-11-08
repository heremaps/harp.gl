/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { mercatorProjection } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { MapControls } from "../lib/MapControls";

declare const global: any;

const inNodeContext = typeof window === "undefined";

describe("MapControls", function() {
    let sandbox: sinon.SinonSandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        if (inNodeContext) {
            const theGlobal: any = global;
            // tslint:disable-next-line:no-empty
            theGlobal.requestAnimationFrame = () => {};
            theGlobal.performance = {
                // tslint:disable-next-line:no-empty
                now: () => {}
            };
        }
    });

    afterEach(function() {
        sandbox.restore();
        if (inNodeContext) {
            delete global.requestAnimationFrame;
            delete global.performance;
        }
    });

    describe("on object creation", function() {
        let addEventListener: () => {};
        let mapView: MapView;
        let mapControls: MapControls;
        let camera: THREE.Camera;
        let domElement: any;
        let maxZoom: number;
        let minZoom: number;
        let minCameraHeight: number;

        beforeEach(function() {
            addEventListener = sandbox.stub();
            camera = {} as any;
            domElement = { addEventListener } as any;
            maxZoom = 10;
            minZoom = 5;
            minCameraHeight = 100;

            mapView = sandbox.createStubInstance(MapView) as any;
            sandbox.stub(mapView, "renderer").get(() => ({ domElement }));
            sandbox.stub(mapView, "camera").get(() => camera);
            sandbox.stub(mapView, "maxZoomLevel").get(() => maxZoom);
            sandbox.stub(mapView, "minZoomLevel").get(() => minZoom);
            sandbox.stub(mapView, "minCameraHeight").get(() => minCameraHeight);
            sandbox.stub(mapView, "projection").get(() => mercatorProjection);

            mapControls = new MapControls(mapView);
        });

        it("initializes camera property using value from constructor param", function() {
            expect(mapControls.camera).to.be.equals(camera);
        });

        it("initializes domElement property using value from constructor param", function() {
            expect(mapControls.domElement).to.be.equals(domElement);
        });

        it("initializes minZoomLevel property using value from constructor param", function() {
            expect(mapControls.minZoomLevel).to.be.equals(minZoom);
        });

        it("initializes maxZoomLevel property using value from constructor param", function() {
            expect(mapControls.maxZoomLevel).to.be.equals(maxZoom);
        });

        it("initializes minCameraHeight property using value from constructor param", function() {
            expect(mapControls.minCameraHeight).to.be.equals(minCameraHeight);
        });
    });

    it("correctly updates mapView on mouse move", function() {
        const updateStub = sandbox.stub();
        //@ts-ignore
        const mapControls = new MapControls({
            renderer: { domElement: { addEventListener: sandbox.stub() } as any } as any,
            updateCamera: updateStub
        });
        sandbox.stub(mapControls, "dispatchEvent");

        expect(updateStub.callCount).to.be.equal(0);
        mapControls.mouseMove({ preventDefault: sandbox.stub(), stopPropagation: sandbox.stub() });
        expect(updateStub.callCount).to.be.equal(1);
    });

    it("correctly updates mapView on touch move", function() {
        const updateStub = sandbox.stub();
        //@ts-ignore
        const mapControls = new MapControls({
            renderer: { domElement: { addEventListener: sandbox.stub() } as any } as any,
            updateCamera: updateStub
        });
        mapControls.m_touchState.touches = { length: 5 };
        sandbox.stub(mapControls, "updateTouches");
        sandbox.stub(mapControls, "dispatchEvent");

        expect(updateStub.callCount).to.be.equal(0);
        mapControls.touchMove({
            touches: [],
            preventDefault: sandbox.stub(),
            stopPropagation: sandbox.stub()
        });
        expect(updateStub.callCount).to.be.equal(1);
    });
});
