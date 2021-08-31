/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import * as THREE from "three";

import { CameraUtils } from "../lib/CameraUtils";
import { MAX_FOV_RAD, MIN_FOV_RAD } from "../lib/FovCalculation";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
describe("CameraUtils", function () {
    let camera: THREE.PerspectiveCamera;

    beforeEach(function () {
        camera = new THREE.PerspectiveCamera();
    });

    it("setFocalLength clamps fov between min and max values", function () {
        const height = 1080;
        expect(CameraUtils.setVerticalFov(camera, 0.9 * MIN_FOV_RAD, height)).equals(
            CameraUtils.setVerticalFov(camera, MIN_FOV_RAD, height)
        );
        expect(CameraUtils.setVerticalFov(camera, 1.1 * MAX_FOV_RAD, height)).equals(
            CameraUtils.setVerticalFov(camera, MAX_FOV_RAD, height)
        );
    });

    describe("setFocalLength and setVerticalFov", function () {
        const tests: Array<[number, number, number, number, number?]> = [
            // [fov (deg), height, ppal point y offset, expected focal length, aspect ratio (opt)]
            [15, 100, 0, 379.78771],
            [45, 100, 0, 120.71068],
            [60, 100, 0, 86.60254],
            [90, 100, 0, 50.0],
            [115, 100, 0, 31.85351],
            [135, 100, 0, 20.71068],

            [15, 3000, 0, 11393.63117],
            [45, 3000, 0, 3621.32034],
            [60, 3000, 0, 2598.07621],
            [90, 3000, 0, 1500.0],
            [115, 3000, 0, 955.60539],
            [135, 3000, 0, 621.32034],

            // off-center projection cases.
            [15, 3000, 0.1, 11391.6897],
            [45, 3000, 0.5, 3484.31348],
            [60, 3000, 1, 1732.0534],
            [89.9, 100, -0.5, 43.38862],
            [89.9999999, 100, -0.5, 43.30127],
            [90, 100, -0.5, 43.30127],
            [90.0000001, 100, -0.5, 43.30127],
            [90.1, 100, -0.1, 49.66218],

            // Corner cases with extreme ppal point offset and obtuse angles. To achieve obtuse fovs
            // the camera code clamps the offset between [-1+eps,1-eps], the computed focal length
            // will be very small. To avoid horizontal fov clamping interfering with the result,
            // set aspect ratio to very small values.
            [115, 100, -1, 1.1e-4, 1e-6],
            [135, 100, -1, 5e-5, 1e-7]
        ];

        for (const test of tests) {
            const [fovDeg, height, ppOffsetY, focalLength, aspect] = test;

            it(`focal length ${focalLength}, fov ${fovDeg}, height ${height}, ppOffsetY ${ppOffsetY}`, function () {
                if (aspect !== undefined) {
                    camera.aspect = aspect;
                }
                const fov = THREE.MathUtils.degToRad(fovDeg);
                CameraUtils.setPrincipalPoint(camera, { x: 0, y: ppOffsetY });

                CameraUtils.setVerticalFov(camera, fov, height);
                expect(CameraUtils.getFocalLength(camera)).closeTo(focalLength, 1e-5);

                CameraUtils.setFocalLength(camera, focalLength, height);
                expect(CameraUtils.getVerticalFov(camera)).closeTo(fov, 1e-2);
            });
        }
    });

    describe("setVerticalFov", function () {
        it("sets correct settings for centered projections", function () {
            camera.aspect = 1.1;
            const height = 100;
            const expectedVFov = Math.PI / 4;
            CameraUtils.setVerticalFov(camera, expectedVFov, height);

            const eps = 1e-6;
            expect(CameraUtils.getFocalLength(camera)).gt(0);
            expect(CameraUtils.getVerticalFov(camera)).closeTo(expectedVFov, eps);
            expect(CameraUtils.getHorizontalFov(camera)).closeTo(0.85506, eps);
            expect(CameraUtils.getTopFov(camera))
                .equals(CameraUtils.getBottomFov(camera))
                .and.equals(CameraUtils.getVerticalFov(camera) / 2);
            expect(CameraUtils.getRightFov(camera))
                .equals(CameraUtils.getLeftFov(camera))
                .and.equals(CameraUtils.getHorizontalFov(camera) / 2);
        });

        it("sets correct settings for off-center projections", function () {
            camera.aspect = 1.1;
            const height = 100;
            const expectedVFov = Math.PI / 4;
            const ppalPoint = { x: 0.5, y: -0.1 };
            CameraUtils.setPrincipalPoint(camera, ppalPoint);
            CameraUtils.setVerticalFov(camera, expectedVFov, height);

            const eps = 1e-6;
            const top = CameraUtils.getTopFov(camera);
            const bottom = CameraUtils.getBottomFov(camera);
            const right = CameraUtils.getRightFov(camera);
            const left = CameraUtils.getLeftFov(camera);
            expect(CameraUtils.getFocalLength(camera)).gt(0);
            expect(CameraUtils.getVerticalFov(camera)).closeTo(expectedVFov, eps);
            expect(CameraUtils.getHorizontalFov(camera)).closeTo(0.824529, eps);
            expect(top).closeTo(0.428084, eps);
            expect(bottom).closeTo(0.357314, eps);
            expect(right).closeTo(0.224313, eps);
            expect(left).closeTo(0.600217, eps);
            expect(top + bottom).closeTo(CameraUtils.getVerticalFov(camera), eps);
            expect(left + right).closeTo(CameraUtils.getHorizontalFov(camera), eps);
        });

        it("clamps vertical fov between min and max values", function () {
            const height = 100;
            const tooSmallFov = 0.9 * MIN_FOV_RAD;
            CameraUtils.setVerticalFov(camera, tooSmallFov, height);
            expect(CameraUtils.getVerticalFov(camera)).equals(MIN_FOV_RAD);

            const tooLargeFov = 1.1 * MAX_FOV_RAD;
            CameraUtils.setVerticalFov(camera, tooLargeFov, height);
            expect(CameraUtils.getVerticalFov(camera)).equals(MAX_FOV_RAD);
        });

        it("clamps horizontal fov between min and max values", function () {
            const height = 100;
            camera.aspect = 0.9;
            CameraUtils.setVerticalFov(camera, MIN_FOV_RAD, height);
            expect(CameraUtils.getHorizontalFov(camera)).equals(MIN_FOV_RAD);

            camera.aspect = 1.1;
            CameraUtils.setVerticalFov(camera, MAX_FOV_RAD, height);
            expect(CameraUtils.getHorizontalFov(camera)).equals(MAX_FOV_RAD);
        });
    });

    describe("setPrincipalPoint", function () {
        it("sets the ppal point coordinates in the projection matrix", function () {
            const ppOffset = { x: -0.42, y: 0.33 };
            CameraUtils.setPrincipalPoint(camera, ppOffset);
            camera.updateProjectionMatrix();
            const actualPpOffset = CameraUtils.getPrincipalPoint(camera);
            expect(actualPpOffset.x).closeTo(ppOffset.x, Number.EPSILON);
            expect(actualPpOffset.y).closeTo(ppOffset.y, Number.EPSILON);
        });

        it("does not allow setting ppal point coordinates to -1 or 1", function () {
            const ppOffset = { x: -1, y: 1 };
            CameraUtils.setPrincipalPoint(camera, ppOffset);
            camera.updateProjectionMatrix();
            const actualPpOffset = CameraUtils.getPrincipalPoint(camera);
            expect(actualPpOffset.x).gt(ppOffset.x).and.closeTo(ppOffset.x, 1e-3);
            expect(actualPpOffset.y).lt(ppOffset.y).and.closeTo(ppOffset.y, 1e-3);
        });
    });
});
