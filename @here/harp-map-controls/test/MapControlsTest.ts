/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import { ElevationProvider, MapView, MapViewUtils } from "@here/harp-mapview";
import { expect } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { MapControls } from "../lib/MapControls";

declare const global: any;

const inNodeContext = typeof window === "undefined";

describe("MapControls", function() {
    let sandbox: sinon.SinonSandbox;
    let domElement: any;
    let mapView: MapView;
    let mapControls: MapControls;
    let camera: THREE.Camera;

    beforeEach(function() {
        if (inNodeContext) {
            const theGlobal: any = global;
            // tslint:disable-next-line:no-empty
            theGlobal.requestAnimationFrame = () => {};
            theGlobal.performance = {
                // tslint:disable-next-line:no-empty
                now: () => {}
            };
        }

        sandbox = sinon.createSandbox();
        domElement = { addEventListener: sandbox.stub() } as any;
        mapView = sandbox.createStubInstance(MapView) as any;
        sandbox.stub(mapView, "renderer").get(() => ({ domElement }));
        camera = new THREE.PerspectiveCamera();
        sandbox.stub(mapView, "camera").get(() => camera);
    });

    afterEach(function() {
        sandbox.restore();
        if (inNodeContext) {
            delete global.requestAnimationFrame;
            delete global.performance;
        }
    });

    describe("on object creation", function() {
        let maxZoom: number;
        let minZoom: number;
        let minCameraHeight: number;

        beforeEach(function() {
            maxZoom = 10;
            minZoom = 5;
            minCameraHeight = 100;

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
        const controls = new MapControls({
            renderer: { domElement: { addEventListener: sandbox.stub() } } as any,
            update: updateStub
        });
        sandbox.stub(controls, "dispatchEvent");
        sandbox.stub(controls, "getPointerPosition").returns({ x: 0, y: 0 });

        expect(updateStub.callCount).to.be.equal(0);
        controls.mouseMove({ preventDefault: sandbox.stub(), stopPropagation: sandbox.stub() });
        expect(updateStub.callCount).to.be.equal(1);
    });

    it("correctly updates mapView on touch move", function() {
        const updateStub = sandbox.stub();
        //@ts-ignore
        const controls = new MapControls({
            renderer: { domElement: { addEventListener: sandbox.stub() } as any } as any,
            update: updateStub
        });
        controls.m_touchState.touches = { length: 5 };
        sandbox.stub(controls, "updateTouches");
        sandbox.stub(controls, "dispatchEvent");
        sandbox.stub(controls, "getPointerPosition").returns({ x: 0, y: 0 });

        expect(updateStub.callCount).to.be.equal(0);
        controls.touchMove({
            touches: [],
            preventDefault: sandbox.stub(),
            stopPropagation: sandbox.stub()
        });
        expect(updateStub.callCount).to.be.equal(1);
    });

    describe("zoomOnTargetPosition", function() {
        const elevationProvider = ({} as any) as ElevationProvider;

        function resetCamera() {
            const target = GeoCoordinates.fromDegrees(0, 0);
            const heading = 0;
            const tilt = 0;
            const distance = 1e6;
            MapViewUtils.getCameraRotationAtTarget(
                mapView.projection,
                target,
                -heading,
                tilt,
                camera.quaternion
            );
            MapViewUtils.getCameraPositionFromTargetCoordinates(
                target,
                distance,
                -heading,
                tilt,
                mapView.projection,
                camera.position
            );
            camera.updateMatrixWorld(true);
        }

        for (const { projName, projection } of [
            { projName: "mercator", projection: mercatorProjection },
            { projName: "sphere", projection: sphereProjection }
        ]) {
            describe(`${projName} projection`, function() {
                beforeEach(function() {
                    sandbox.stub(mapView, "projection").get(() => projection);
                    sandbox.stub(mapView, "focalLength").get(() => 100);
                    mapControls = new MapControls(mapView);
                    resetCamera();
                });

                it("camera distance is offset by elevation", function() {
                    elevationProvider.getHeight = sandbox.stub().returns(0);
                    sandbox.stub(mapView, "elevationProvider").get(() => elevationProvider);

                    mapControls.zoomOnTargetPosition(0, 0, 10);
                    const altitudeWithoutElevation = projection.unprojectAltitude(camera.position);

                    resetCamera();
                    const elevation = 333;
                    elevationProvider.getHeight = sandbox.stub().returns(elevation);
                    mapControls.zoomOnTargetPosition(0, 0, 10);
                    const altitudeWithElevation = projection.unprojectAltitude(camera.position);

                    expect(altitudeWithElevation).equals(altitudeWithoutElevation + elevation);
                });
            });
        }
    });
});
