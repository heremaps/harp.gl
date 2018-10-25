/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapView } from "@here/harp-mapview";
import { expect } from "chai";
import * as sinon from "sinon";
import { MapControls } from "../lib/MapControls";

describe("MapControls", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("on object creation", () => {
        let addEventListener: () => {};
        let mapView: MapView;
        let mapControls: MapControls;
        let camera: THREE.Camera;
        let domElement: any;
        let maxZoom: number;
        let minZoom: number;
        let minCameraHeight: number;

        beforeEach(() => {
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

            mapControls = new MapControls(mapView);
        });

        it("initializes camera property using value from constructor param", () => {
            expect(mapControls.camera).to.be.equals(camera);
        });

        it("initializes domElement property using value from constructor param", () => {
            expect(mapControls.domElement).to.be.equals(domElement);
        });

        it("initializes minZoomLevel property using value from constructor param", () => {
            expect(mapControls.minZoomLevel).to.be.equals(minZoom);
        });

        it("initializes maxZoomLevel property using value from constructor param", () => {
            expect(mapControls.maxZoomLevel).to.be.equals(maxZoom);
        });

        it("initializes minCameraHeight property using value from constructor param", () => {
            expect(mapControls.minCameraHeight).to.be.equals(minCameraHeight);
        });
    });

    it("correctly updates mapView on mouse move", () => {
        const updateStub = sandbox.stub();
        //@ts-ignore
        const mapControls = new MapControls({
            renderer: { domElement: { addEventListener: sandbox.stub() } as any } as any,
            update: updateStub
        });
        sandbox.stub(mapControls, "dispatchEvent");

        expect(updateStub.callCount).to.be.equal(0);
        mapControls.mouseMove({ preventDefault: sandbox.stub(), stopPropagation: sandbox.stub() });
        expect(updateStub.callCount).to.be.equal(1);
    });

    it("correctly updates mapView on touch move", () => {
        const updateStub = sandbox.stub();
        //@ts-ignore
        const mapControls = new MapControls({
            renderer: { domElement: { addEventListener: sandbox.stub() } as any } as any,
            update: updateStub
        });
        mapControls.m_touchState.touches = { length: 5 };
        sandbox.stub(mapControls, "updateTouches");
        sandbox.stub(mapControls, "updateTouchState");
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
