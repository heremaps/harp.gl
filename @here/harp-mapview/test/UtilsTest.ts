/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { GeoCoordinates, MathUtils, mercatorProjection } from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";
import { MapView } from "../lib/MapView";
import { MapViewUtils } from "../lib/Utils";

describe("map-view#Utils", function() {
    it("calculates zoom level", function() {
        const mapViewMock = {
            maxZoomLevel: 20,
            minZoomLevel: 1,
            zoomLevelBias: 1,
            camera: {
                fov: 40
            }
        };
        const mapView = (mapViewMock as any) as MapView;

        let result = MapViewUtils.calculateZoomLevelFromHeight(0, mapView);
        expect(result).to.be.equal(20);
        result = MapViewUtils.calculateZoomLevelFromHeight(1000000000000, mapView);
        expect(result).to.be.equal(1);
        /*
         *   23.04.2018 - Zoom level outputs come from HARP
         */
        result = MapViewUtils.calculateZoomLevelFromHeight(1000, mapView);
        expect(result).to.be.closeTo(15.79, 0.05);
        result = MapViewUtils.calculateZoomLevelFromHeight(10000, mapView);
        expect(result).to.be.closeTo(12.47, 0.05);
        result = MapViewUtils.calculateZoomLevelFromHeight(1000000, mapView);
        expect(result).to.be.closeTo(5.82, 0.05);
    });

    it("converts target coordinates from XYZ to camera coordinates", function() {
        const xyzView = {
            zoom: 5,
            yaw: 3,
            pitch: 15,
            center: [10, -10]
        };
        const mapViewMock = {
            zoomLevelBias: 1,
            camera: {
                fov: 40
            },
            projection: mercatorProjection
        };
        const mapView = (mapViewMock as any) as MapView;
        const cameraCoordinates = MapViewUtils.getCameraCoordinatesFromTargetCoordinates(
            new GeoCoordinates(xyzView.center[0], xyzView.center[1]),
            xyzView.zoom,
            xyzView.yaw,
            xyzView.pitch,
            mapView
        );
        expect(cameraCoordinates.latitude).to.equal(5.905314743802695);
        expect(cameraCoordinates.longitude).to.equal(-9.783274868705762);
    });

    describe("converts zoom level to height and height to zoom level", function() {
        const height = 1000;
        let mapViewMock: any;

        beforeEach(function() {
            mapViewMock = {
                maxZoomLevel: 20,
                minZoomLevel: 1,
                zoomLevelBias: 0.5,
                camera: { fov: 40 }
            };
        });

        it("ensures that both functions are inverse", function() {
            const zoomLevel = MapViewUtils.calculateZoomLevelFromHeight(height, { ...mapViewMock });
            const calculatedHeight = MapViewUtils.calculateDistanceToGroundFromZoomLevel(
                mapViewMock,
                zoomLevel
            );

            expect(height).to.be.closeTo(calculatedHeight, Math.pow(10, -11));
        });

        it("respect zoomLevelBias property", function() {
            const biasFactor = 4;
            mapViewMock.zoomLevelBias = 1;
            const heightNonBiased = MapViewUtils.calculateDistanceToGroundFromZoomLevel(
                { ...mapViewMock },
                10
            );
            mapViewMock.zoomLevelBias = 1 / biasFactor;
            const heightBiased = MapViewUtils.calculateDistanceToGroundFromZoomLevel(
                { ...mapViewMock },
                10
            );

            expect(heightNonBiased).to.be.equal(heightBiased / biasFactor);
        });
    });

    it("calculates horizontal and vertical fov", function() {
        const vFov = 60;
        const hFov = MathUtils.radToDeg(
            MapViewUtils.calculateHorizontalFovByVerticalFov(MathUtils.degToRad(vFov), 0.9)
        );
        const calculatedVFov = MathUtils.radToDeg(
            MapViewUtils.calculateVerticalFovByHorizontalFov(MathUtils.degToRad(hFov), 0.9)
        );
        expect(vFov).to.be.closeTo(calculatedVFov, 0.00000000001);
    });

    it("calculates memory usage", function() {
        const testObject1 = { str: "aaa", bool: true, num: 12, test: {} };
        const testObject2 = { num: 1, test: testObject1 };
        testObject1.test = testObject2;
        const result = MapViewUtils.estimateObjectSize(testObject1);
        expect(result).to.be.equal(26);
    });

    it("calculates memory usage for circular references", function() {
        const testObject1 = { str: "aaa", bool: true, num: 12, test: {} };
        const testObject2 = { num: 1, test: {} };
        const testObject3 = { string: "bbb", test: {} };
        testObject1.test = testObject2;
        testObject2.test = testObject3;
        testObject3.test = testObject1;
        const result = MapViewUtils.estimateObjectSize(testObject1);
        expect(result).to.be.equal(32);
    });

    it("calculates memory usage for arrays of values and arrays of objects", function() {
        const testObject = {
            str: "aaa",
            bool: true,
            num: 12,
            arr: [1, 2, 3, true, false, "ccc"],
            arrObj: [{}, { num: 12 }, { num: 11, obj: { str: "aaa" } }],
            arrBuff: new ArrayBuffer(100),
            typedBuff: new Float32Array(10)
        };
        const result = MapViewUtils.estimateObjectSize(testObject);
        expect(result).to.be.equal(228);
    });

    it("estimate size of world with one cube", async function() {
        const scene: THREE.Scene = new THREE.Scene();
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);
        expect(MapViewUtils.estimateObjectSize(scene)).to.be.equal(4634);
    });

    it("estimate size of world with 1000 cubes", async function() {
        this.timeout(4000);
        const scene: THREE.Scene = new THREE.Scene();
        for (let i = 0; i < 1000; i++) {
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
            const cube = new THREE.Mesh(geometry, material);
            scene.add(cube);
        }
        expect(MapViewUtils.estimateObjectSize(scene)).to.be.equal(4082552);
    });
});
