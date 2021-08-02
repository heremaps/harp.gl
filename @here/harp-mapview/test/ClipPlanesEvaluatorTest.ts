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

import { TiltViewClipPlanesEvaluator } from "../lib/ClipPlanesEvaluator";
import { MapViewUtils } from "../lib/Utils";

function setupPerspectiveCamera(
    projection: Projection,
    zoomLevel?: number,
    distance?: number,
    tilt: number = 0
): THREE.PerspectiveCamera {
    const vFov = 90;
    const camera = new THREE.PerspectiveCamera(vFov, 1, 1, 100);
    const geoTarget = new GeoCoordinates(0, 0);
    const heading = 0;

    MapViewUtils.getCameraRotationAtTarget(projection, geoTarget, heading, tilt, camera.quaternion);

    const canvasHeight = 500;
    const focalLength = MapViewUtils.calculateFocalLengthByVerticalFov(
        THREE.MathUtils.degToRad(vFov),
        canvasHeight
    );
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
}

const mercatorZoomTruthTable: ZoomLevelTest[] = [
    { zoomLevel: 1, far: 20057066, near: 19077865 },
    { zoomLevel: 2, far: 10028528, near: 9538523 },
    { zoomLevel: 3, far: 5014259, near: 4768853 },
    { zoomLevel: 4, far: 2507124, near: 2384018 },
    { zoomLevel: 5, far: 1253557, near: 1191600 },
    { zoomLevel: 6, far: 626773, near: 595391 },
    { zoomLevel: 7, far: 313381, near: 297287 },
    { zoomLevel: 8, far: 156686, near: 148235 },
    { zoomLevel: 9, far: 78338, near: 73708 },
    { zoomLevel: 10, far: 39164, near: 36445 },
    { zoomLevel: 11, far: 19577, near: 17814 },
    { zoomLevel: 12, far: 9783, near: 8498 },
    { zoomLevel: 13, far: 4886, near: 3840 },
    { zoomLevel: 14, far: 2438, near: 1511 },
    { zoomLevel: 15, far: 1214, near: 347 },
    { zoomLevel: 16, far: 605, near: 1 },
    { zoomLevel: 17, far: 302, near: 1 },
    { zoomLevel: 18, far: 151, near: 1 },
    { zoomLevel: 19, far: 76, near: 1 },
    { zoomLevel: 20, far: 38, near: 1 },
    { tilt: 45, zoomLevel: 1, far: 118997158, near: 8193471 },
    { tilt: 45, zoomLevel: 2, far: 59498575, near: 4096447 },
    { tilt: 45, zoomLevel: 3, far: 29749284, near: 2047934 },
    { tilt: 45, zoomLevel: 4, far: 14874638, near: 1023678 },
    { tilt: 45, zoomLevel: 5, far: 7437316, near: 511550 },
    { tilt: 45, zoomLevel: 6, far: 3718654, near: 255486 },
    { tilt: 45, zoomLevel: 7, far: 1859323, near: 127454 },
    { tilt: 45, zoomLevel: 8, far: 929658, near: 63438 },
    { tilt: 45, zoomLevel: 9, far: 464825, near: 31430 },
    { tilt: 45, zoomLevel: 10, far: 232409, near: 15426 },
    { tilt: 45, zoomLevel: 11, far: 116201, near: 7424 },
    { tilt: 45, zoomLevel: 12, far: 58097, near: 3423 },
    { tilt: 45, zoomLevel: 13, far: 29045, near: 1422 },
    { tilt: 45, zoomLevel: 14, far: 14519, near: 422 },
    { tilt: 45, zoomLevel: 15, far: 7256, near: 1 },
    { tilt: 45, zoomLevel: 16, far: 3628, near: 1 },
    { tilt: 45, zoomLevel: 17, far: 1814, near: 1 },
    { tilt: 45, zoomLevel: 18, far: 907, near: 1 },
    { tilt: 45, zoomLevel: 19, far: 453, near: 1 },
    { tilt: 45, zoomLevel: 20, far: 227, near: 1 }
];

const sphereZoomTruthTable: ZoomLevelTest[] = [
    { zoomLevel: 1, far: 25028303, near: 19016491 },
    { zoomLevel: 2, far: 14033501, near: 9489079 },
    { zoomLevel: 3, far: 7903190, near: 4733187 },
    { zoomLevel: 4, far: 4369110, near: 2361030 },
    { zoomLevel: 5, far: 1721023, near: 1185829 },
    { zoomLevel: 6, far: 701834, near: 594464 },
    { zoomLevel: 7, far: 329865, near: 297083 },
    { zoomLevel: 8, far: 160586, near: 148186 },
    { zoomLevel: 9, far: 79288, near: 73697 },
    { zoomLevel: 10, far: 39398, near: 36443 },
    { zoomLevel: 11, far: 19635, near: 17813 },
    { zoomLevel: 12, far: 9798, near: 8498 },
    { zoomLevel: 13, far: 4890, near: 3840 },
    { zoomLevel: 14, far: 2439, near: 1511 },
    { zoomLevel: 15, far: 1214, near: 347 },
    { zoomLevel: 16, far: 605, near: 1 },
    { zoomLevel: 17, far: 302, near: 1 },
    { zoomLevel: 18, far: 151, near: 1 },
    { zoomLevel: 19, far: 76, near: 1 },
    { zoomLevel: 20, far: 38, near: 1 },
    { tilt: 45, zoomLevel: 1, far: 24199114, near: 17181678 },
    { tilt: 45, zoomLevel: 2, far: 13812467, near: 7646758 },
    { tilt: 45, zoomLevel: 3, far: 8309093, near: 3024516 },
    { tilt: 45, zoomLevel: 4, far: 5235087, near: 1309563 },
    { tilt: 45, zoomLevel: 5, far: 3408142, near: 602421 },
    { tilt: 45, zoomLevel: 6, far: 2269560, near: 283622 },
    { tilt: 45, zoomLevel: 7, far: 1539268, near: 133965 },
    { tilt: 45, zoomLevel: 8, far: 929666, near: 64077 },
    { tilt: 45, zoomLevel: 9, far: 464827, near: 31590 },
    { tilt: 45, zoomLevel: 10, far: 232410, near: 15466 },
    { tilt: 45, zoomLevel: 11, far: 116201, near: 7434 },
    { tilt: 45, zoomLevel: 12, far: 58097, near: 3425 },
    { tilt: 45, zoomLevel: 13, far: 29045, near: 1423 },
    { tilt: 45, zoomLevel: 14, far: 14519, near: 422 },
    { tilt: 45, zoomLevel: 15, far: 7256, near: 1 },
    { tilt: 45, zoomLevel: 16, far: 3628, near: 1 },
    { tilt: 45, zoomLevel: 17, far: 1814, near: 1 },
    { tilt: 45, zoomLevel: 18, far: 907, near: 1 },
    { tilt: 45, zoomLevel: 19, far: 453, near: 1 },
    { tilt: 45, zoomLevel: 20, far: 227, near: 1 }
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
                const tiltDeg = 45;
                const camera = setupPerspectiveCamera(projection, undefined, distance, tiltDeg);
                const viewRange = evaluator.evaluateClipPlanes(camera, projection);
                const eps = 1e-6;
                expect(viewRange.far).closeTo(expectedFar, eps);
                expect(viewRange.maximum).closeTo(expectedFar, eps);
            });
            describe("evaluateClipPlanes returns correct values for each zoom & tilt", function () {
                zoomTruthTable.forEach((test: ZoomLevelTest) => {
                    it(`zoom level ${test.zoomLevel}, tilt ${test.tilt ?? 0}`, function () {
                        const evaluator = new TiltViewClipPlanesEvaluator();
                        const camera = setupPerspectiveCamera(
                            projection,
                            test.zoomLevel,
                            undefined,
                            test.tilt
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
