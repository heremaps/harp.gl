/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import {
    GeoCoordinates,
    mercatorProjection,
    Projection,
    sphereProjection
} from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import { CameraUtils } from "../lib/CameraUtils";
import { TiltViewClipPlanesEvaluator } from "../lib/ClipPlanesEvaluator";
import { MapViewUtils } from "../lib/Utils";

function setupPerspectiveCamera(
    projection: Projection,
    zoomLevel?: number,
    distance?: number,
    tilt: number = 0,
    principalPointNDC?: THREE.Vector2
): THREE.PerspectiveCamera {
    const vFov = 40;
    const vFovRad = THREE.MathUtils.degToRad(vFov);
    const camera = new THREE.PerspectiveCamera(vFov, 1, 1, 100);
    const geoTarget = new GeoCoordinates(0, 0);
    const heading = 0;
    const canvasHeight = 500;

    if (principalPointNDC) {
        CameraUtils.setPrincipalPoint(camera, principalPointNDC);
    }
    CameraUtils.setVerticalFov(camera, vFovRad, canvasHeight);
    const focalLength = CameraUtils.getFocalLength(camera)!;

    MapViewUtils.getCameraRotationAtTarget(projection, geoTarget, heading, tilt, camera.quaternion);
    if (!distance) {
        expect(zoomLevel).to.not.be.undefined;
        distance = MapViewUtils.calculateDistanceFromZoomLevel({ focalLength }, zoomLevel ?? 1);
    }
    MapViewUtils.getCameraPositionFromTargetCoordinates(
        geoTarget,
        distance,
        heading,
        tilt,
        projection,
        camera.position
    );
    camera.updateMatrixWorld();

    return camera;
}

interface ZoomLevelTest {
    tilt?: number;
    zoomLevel: number;
    far: number;
    near: number;
    ppalPointNDC?: [number, number];
}

const mercatorZoomTruthTable: ZoomLevelTest[] = [
    // Top down view tests.
    { zoomLevel: 1, far: 53762306, near: 53762306 },
    { zoomLevel: 2, far: 26881153, near: 26881153 },
    { zoomLevel: 3, far: 13440577, near: 13440577 },
    { zoomLevel: 4, far: 6720288, near: 6720288 },
    { zoomLevel: 5, far: 3360144, near: 3360144 },
    { zoomLevel: 6, far: 1680072, near: 1680072 },
    { zoomLevel: 7, far: 840036, near: 840036 },
    { zoomLevel: 8, far: 420018, near: 420018 },
    { zoomLevel: 9, far: 210009, near: 210009 },
    { zoomLevel: 10, far: 105005, near: 105005 },
    { zoomLevel: 11, far: 52502, near: 52502 },
    { zoomLevel: 12, far: 26251, near: 26251 },
    { zoomLevel: 13, far: 13126, near: 13126 },
    { zoomLevel: 14, far: 6563, near: 6563 },
    { zoomLevel: 15, far: 3281, near: 3281 },
    { zoomLevel: 16, far: 1641, near: 1641 },
    { zoomLevel: 17, far: 820, near: 820 },
    { zoomLevel: 18, far: 410, near: 410 },
    { zoomLevel: 19, far: 205, near: 205 },
    { zoomLevel: 20, far: 103, near: 103 },

    // Tilted view, horizon not visible.
    { tilt: 45, zoomLevel: 1, far: 84527972, near: 39416041 },
    { tilt: 45, zoomLevel: 2, far: 42263986, near: 19708020 },
    { tilt: 45, zoomLevel: 3, far: 21131993, near: 9854010 },
    { tilt: 45, zoomLevel: 4, far: 10565997, near: 4927005 },
    { tilt: 45, zoomLevel: 5, far: 5282998, near: 2463503 },
    { tilt: 45, zoomLevel: 6, far: 2641499, near: 1231751 },
    { tilt: 45, zoomLevel: 7, far: 1320750, near: 615876 },
    { tilt: 45, zoomLevel: 8, far: 660375, near: 307938 },
    { tilt: 45, zoomLevel: 9, far: 330187, near: 153969 },
    { tilt: 45, zoomLevel: 10, far: 165094, near: 76984 },
    { tilt: 45, zoomLevel: 11, far: 82547, near: 38492 },
    { tilt: 45, zoomLevel: 12, far: 41273, near: 19246 },
    { tilt: 45, zoomLevel: 13, far: 20637, near: 9623 },
    { tilt: 45, zoomLevel: 14, far: 10318, near: 4812 },
    { tilt: 45, zoomLevel: 15, far: 5159, near: 2406 },
    { tilt: 45, zoomLevel: 16, far: 2580, near: 1203 },
    { tilt: 45, zoomLevel: 17, far: 1290, near: 601 },
    { tilt: 45, zoomLevel: 18, far: 645, near: 301 },
    { tilt: 45, zoomLevel: 19, far: 322, near: 150 },
    { tilt: 45, zoomLevel: 20, far: 161, near: 75 },

    // Change horizon visibility by changing tilt or offsetting principal point.
    { tilt: 60, zoomLevel: 15, far: 8879, near: 2013 },
    { tilt: 60, zoomLevel: 15, far: 293891, near: 2746, ppalPointNDC: [0, -0.9] },
    { tilt: 70, zoomLevel: 15, far: 328139, near: 1641 },
    { tilt: 70, zoomLevel: 15, far: 3856, near: 1020, ppalPointNDC: [0, 0.8] },
    { tilt: 80, zoomLevel: 15, far: 328139, near: 1071 }
];

const sphereZoomTruthTable: ZoomLevelTest[] = [
    { zoomLevel: 1, far: 59464016, near: 53762306 },
    { zoomLevel: 2, far: 32036154, near: 26881153 },
    { zoomLevel: 3, far: 17766076, near: 13440577 },
    { zoomLevel: 4, far: 8418150, near: 6720288 },
    { zoomLevel: 5, far: 3641838, near: 3360144 },
    { zoomLevel: 6, far: 1743526, near: 1680072 },
    { zoomLevel: 7, far: 855246, near: 840036 },
    { zoomLevel: 8, far: 423749, near: 420018 },
    { zoomLevel: 9, far: 210933, near: 210009 },
    { zoomLevel: 10, far: 105235, near: 105005 },
    { zoomLevel: 11, far: 52560, near: 52502 },
    { zoomLevel: 12, far: 26265, near: 26251 },
    { zoomLevel: 13, far: 13129, near: 13126 },
    { zoomLevel: 14, far: 6564, near: 6563 },
    { zoomLevel: 15, far: 3282, near: 3281 },
    { zoomLevel: 16, far: 1641, near: 1641 },
    { zoomLevel: 17, far: 820, near: 820 },
    { zoomLevel: 18, far: 410, near: 410 },
    { zoomLevel: 19, far: 205, near: 205 },
    { zoomLevel: 20, far: 103, near: 103 },
    { tilt: 45, zoomLevel: 1, far: 58067604, near: 51894193 },
    { tilt: 45, zoomLevel: 2, far: 31009971, near: 25013040 },
    { tilt: 45, zoomLevel: 3, far: 17277892, near: 11579312 },
    { tilt: 45, zoomLevel: 4, far: 10131005, near: 5384245 },
    { tilt: 45, zoomLevel: 5, far: 6233888, near: 2584338 },
    { tilt: 45, zoomLevel: 6, far: 3976347, near: 1263063 },
    { tilt: 45, zoomLevel: 7, far: 1500918, near: 623865 },
    { tilt: 45, zoomLevel: 8, far: 696027, near: 309957 },
    { tilt: 45, zoomLevel: 9, far: 338345, near: 154477 },
    { tilt: 45, zoomLevel: 10, far: 167054, near: 77112 },
    { tilt: 45, zoomLevel: 11, far: 83028, near: 38524 },
    { tilt: 45, zoomLevel: 12, far: 41393, near: 19254 },
    { tilt: 45, zoomLevel: 13, far: 20666, near: 9625 },
    { tilt: 45, zoomLevel: 14, far: 10326, near: 4812 },
    { tilt: 45, zoomLevel: 15, far: 5161, near: 2406 },
    { tilt: 45, zoomLevel: 16, far: 2580, near: 1203 },
    { tilt: 45, zoomLevel: 17, far: 1290, near: 601 },
    { tilt: 45, zoomLevel: 18, far: 645, near: 301 },
    { tilt: 45, zoomLevel: 19, far: 322, near: 150 },
    { tilt: 45, zoomLevel: 20, far: 161, near: 75 },

    // Make horizon visible by offseting principal point.
    { zoomLevel: 4, far: 9115538, near: 6018885, ppalPointNDC: [0, -0.9] },
    { zoomLevel: 4, far: 9115538, near: 6018885, ppalPointNDC: [0, 0.9] },
    { zoomLevel: 4, far: 9992660, near: 6720288, ppalPointNDC: [-0.9, 0] },
    { zoomLevel: 4, far: 9992660, near: 6720288, ppalPointNDC: [0.9, 0] }
];

describe("ClipPlanesEvaluator", function () {
    it("constructor sets properties to valid values by default", function () {
        const evaluator = new TiltViewClipPlanesEvaluator();

        expect(evaluator.maxElevation).gte(evaluator.minElevation);
        expect(evaluator.nearMin).gt(0);
        expect(evaluator.nearFarMarginRatio).gt(0);
        expect(evaluator.farMaxRatio).gt(0);
    });

    it("minElevation setter updates invalid maxElevation", function () {
        const maxElevation = 100;
        const minElevation = 10;
        const evaluator = new TiltViewClipPlanesEvaluator(maxElevation, minElevation);

        expect(evaluator.minElevation).eq(minElevation);
        expect(evaluator.maxElevation).eq(maxElevation);

        const newMinElevation = maxElevation + 1;
        evaluator.minElevation = newMinElevation;

        expect(evaluator.minElevation).eq(newMinElevation);
        expect(evaluator.maxElevation).eq(newMinElevation);
    });

    it("maxElevation setter updats invalid minElevation", function () {
        const maxElevation = 100;
        const minElevation = 10;
        const evaluator = new TiltViewClipPlanesEvaluator(maxElevation, minElevation);

        expect(evaluator.minElevation).eq(minElevation);
        expect(evaluator.maxElevation).eq(maxElevation);

        const newMaxElevation = minElevation - 1;
        evaluator.maxElevation = newMaxElevation;

        expect(evaluator.minElevation).eq(newMaxElevation);
        expect(evaluator.maxElevation).eq(newMaxElevation);
    });

    for (const [projection, projName, zoomTruthTable] of [
        [mercatorProjection, "mercator", mercatorZoomTruthTable],
        [sphereProjection, "sphere", sphereZoomTruthTable]
    ] as Array<[Projection, string, ZoomLevelTest[]]>) {
        describe(`${projName}`, function () {
            it("evaluateClipPlanes applies nearMin constraint", function () {
                const nearMin = 100;
                const distance = nearMin / 10;
                const evaluator = new TiltViewClipPlanesEvaluator(0, 0, nearMin);
                const camera = setupPerspectiveCamera(projection, undefined, distance);
                const viewRange = evaluator.evaluateClipPlanes(camera, projection);
                expect(viewRange.near).eq(nearMin);
                expect(viewRange.minimum).eq(nearMin);
            });

            it("evaluateClipPlanes applies nearFarMarginRatio constraint", function () {
                const nearMin = 1;
                const nearFarMarginRatio = 2;
                const distance = 50;
                const evaluator = new TiltViewClipPlanesEvaluator(
                    0,
                    0,
                    nearMin,
                    nearFarMarginRatio
                );
                const camera = setupPerspectiveCamera(projection, undefined, distance);
                const viewRange = evaluator.evaluateClipPlanes(camera, projection);
                const eps = 1e-3;
                expect(viewRange.far - viewRange.near).closeTo(distance * nearFarMarginRatio, eps);
            });

            it("evaluateClipPlanes applies farMaxRatio constraint", function () {
                const nearMin = 1;
                const farMaxRatio = 2;
                const nearFarMarginRatio = 0; // Remove margins so that they don't affect the results.
                const distance = 50;
                const expectedFar = distance * farMaxRatio;
                const evaluator = new TiltViewClipPlanesEvaluator(
                    0,
                    0,
                    nearMin,
                    nearFarMarginRatio,
                    farMaxRatio
                );
                // Tilt camera to force a large far distance.
                const tiltDeg = 60;
                const camera = setupPerspectiveCamera(projection, undefined, distance, tiltDeg);
                const viewRange = evaluator.evaluateClipPlanes(camera, projection);
                const eps = 1e-6;
                expect(viewRange.far).closeTo(expectedFar, eps);
                expect(viewRange.maximum).closeTo(expectedFar, eps);
            });
            describe("evaluateClipPlanes returns correct values for each zoom & tilt", function () {
                zoomTruthTable.forEach((test: ZoomLevelTest) => {
                    it(`zoom level ${test.zoomLevel}, tilt ${test.tilt ?? 0}, ppal point ${
                        test.ppalPointNDC ?? [0, 0]
                    }`, function () {
                        // Relax constraints to see the effects of tilt and principal point.
                        const minElevation = 0;
                        const maxElevation = 0;
                        const minNear = 1;
                        const nearFarMarginRatio = 0;
                        const farMaxRatio = 100;
                        const evaluator = new TiltViewClipPlanesEvaluator(
                            minElevation,
                            maxElevation,
                            minNear,
                            nearFarMarginRatio,
                            farMaxRatio
                        );
                        const ppalPointNDC = test.ppalPointNDC
                            ? new THREE.Vector2(test.ppalPointNDC[0], test.ppalPointNDC[1])
                            : undefined;
                        const camera = setupPerspectiveCamera(
                            projection,
                            test.zoomLevel,
                            undefined,
                            test.tilt,
                            ppalPointNDC
                        );
                        const viewRange = evaluator.evaluateClipPlanes(camera, projection);
                        expect(Math.round(viewRange.far)).eq(test.far);
                        expect(Math.round(viewRange.near)).eq(test.near);
                    });
                });
            });
        });
    }
});
