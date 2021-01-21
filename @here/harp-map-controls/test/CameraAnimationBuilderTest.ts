/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, mercatorProjection } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { CameraAnimationBuilder } from "../lib/CameraAnimationBuilder";
import { CameraKeyTrackAnimationOptions, ControlPoint } from "../lib/CameraKeyTrackAnimation";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("MapControls", function () {
    let animationOptions: CameraKeyTrackAnimationOptions;
    let controlPoint_0: ControlPoint;
    let controlPoint_1: ControlPoint;
    let controlPoint_2: ControlPoint;
    let sandbox: sinon.SinonSandbox;
    let mapView: MapView;
    let camera: THREE.Camera;
    beforeEach(function () {
        controlPoint_0 = new ControlPoint({
            target: new GeoCoordinates(0, 0),
            timestamp: 0
        });
        controlPoint_1 = new ControlPoint({
            target: new GeoCoordinates(1, 1),
            timestamp: 100
        });
        controlPoint_2 = new ControlPoint({
            target: new GeoCoordinates(2, 2),
            timestamp: 200
        });
        animationOptions = {
            controlPoints: [controlPoint_0, controlPoint_1]
        };
        sandbox = sinon.createSandbox();
        mapView = sandbox.createStubInstance(MapView) as any;
        camera = new THREE.PerspectiveCamera(40);
        sandbox.stub(mapView, "camera").get(() => camera);
        sandbox.stub(mapView, "projection").get(() => mercatorProjection);
    });
    describe("CameraAnimationBuilder", function () {
        it("prepends a control point with default time", function () {
            CameraAnimationBuilder.prependControlPoint(animationOptions, controlPoint_2);

            assert.equal(animationOptions.controlPoints.length, 3);
            assert.equal(animationOptions.controlPoints[0].timestamp, 0);
            assert.equal(animationOptions.controlPoints[0].target.latitude, 2);
            assert.equal(animationOptions.controlPoints[1].target.latitude, 0);
            assert.notEqual(animationOptions.controlPoints[1].timestamp, 0);
        });

        it("prepends a control point with specified time", function () {
            CameraAnimationBuilder.prependControlPoint(animationOptions, controlPoint_2, 20);

            assert.equal(animationOptions.controlPoints.length, 3);
            assert.equal(animationOptions.controlPoints[0].timestamp, 0);
            assert.equal(animationOptions.controlPoints[0].target.latitude, 2);
            assert.equal(animationOptions.controlPoints[1].target.latitude, 0);
            assert.equal(animationOptions.controlPoints[1].timestamp, 20);
        });

        it("append a control point with fitting time", function () {
            CameraAnimationBuilder.appendControlPoint(animationOptions, controlPoint_2);

            assert.equal(animationOptions.controlPoints.length, 3);
            assert.equal(animationOptions.controlPoints[2].target.latitude, 2);
            assert.equal(animationOptions.controlPoints[2].timestamp, 200);
        });

        it("appends a control point with timestamp smaller then the preceding one ", function () {
            controlPoint_2.timestamp = 0;
            CameraAnimationBuilder.appendControlPoint(animationOptions, controlPoint_2);

            assert.equal(animationOptions.controlPoints.length, 3);
            assert.equal(animationOptions.controlPoints[2].target.latitude, 2);
            assert.equal(animationOptions.controlPoints[2].timestamp, 110);
        });

        it(
            "appends a control point with timestamp smaller then the preceding one, and set" +
                "appendTime",
            function () {
                controlPoint_2.timestamp = 0;
                CameraAnimationBuilder.appendControlPoint(animationOptions, controlPoint_2, 20);

                assert.equal(animationOptions.controlPoints.length, 3);
                assert.equal(animationOptions.controlPoints[2].target.latitude, 2);
                assert.equal(animationOptions.controlPoints[2].timestamp, 120);
            }
        );

        it("appends a control point to an empty control point list", function () {
            const options: CameraKeyTrackAnimationOptions = { controlPoints: [] };
            CameraAnimationBuilder.appendControlPoint(options, controlPoint_2);

            assert.equal(options.controlPoints.length, 1);
            assert.equal(options.controlPoints[0].target.latitude, 2);
            assert.equal(options.controlPoints[0].timestamp, 200);
        });

        it("creates Bow Fly To options with defaults", function () {
            const bowOptions = CameraAnimationBuilder.createBowFlyToOptions(
                mapView,
                controlPoint_0,
                controlPoint_1
            );

            assert.equal(bowOptions.controlPoints.length, 4);
            assert.equal(bowOptions.controlPoints[1].target.latitude, 0.25);
            assert.equal(bowOptions.controlPoints[2].target.latitude, 0.75);
            assert.equal(bowOptions.controlPoints[0].distance, 0);
            assert.isAbove(bowOptions.controlPoints[1].distance, 0);
            assert.isAbove(bowOptions.controlPoints[2].distance, 0);
            assert.equal(bowOptions.controlPoints[0].timestamp, 0);
            assert.equal(bowOptions.controlPoints[1].timestamp, 10 / 3);
            assert.equal(bowOptions.controlPoints[2].timestamp, 20 / 3);
            assert.equal(bowOptions.controlPoints[3].timestamp, 10);
        });

        it("creates Bow Fly To options with specified altitude and duration", function () {
            const bowOptions = CameraAnimationBuilder.createBowFlyToOptions(
                mapView,
                controlPoint_0,
                controlPoint_1,
                1000,
                15
            );

            assert.equal(bowOptions.controlPoints.length, 4);
            assert.equal(bowOptions.controlPoints[1].target.latitude, 0.25);
            assert.equal(bowOptions.controlPoints[2].target.latitude, 0.75);
            assert.equal(bowOptions.controlPoints[0].distance, 0);
            assert.equal(bowOptions.controlPoints[1].distance, 1000);
            assert.equal(bowOptions.controlPoints[2].distance, 1000);
            assert.equal(bowOptions.controlPoints[0].timestamp, 0);
            assert.equal(bowOptions.controlPoints[1].timestamp, 5);
            assert.equal(bowOptions.controlPoints[2].timestamp, 10);
            assert.equal(bowOptions.controlPoints[3].timestamp, 15);
        });
        it("creates orbit options", function () {
            const orbitOptions = CameraAnimationBuilder.createOrbitOptions(controlPoint_0);

            assert.equal(orbitOptions.controlPoints.length, 4);
            assert.equal(orbitOptions.controlPoints[0].heading, 0);
            assert.equal(orbitOptions.controlPoints[1].heading, -120);
            assert.equal(orbitOptions.controlPoints[2].heading, -240);
            assert.equal(orbitOptions.controlPoints[3].heading, -360);
            assert.equal(orbitOptions.controlPoints[0].timestamp, 0);
            assert.equal(orbitOptions.controlPoints[1].timestamp, 10 / 3);
            assert.equal(orbitOptions.controlPoints[2].timestamp, 20 / 3);
            assert.equal(orbitOptions.controlPoints[3].timestamp, 10);
        });
    });
});
