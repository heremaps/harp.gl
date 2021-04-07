/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import { TiltViewClipPlanesEvaluator } from "../lib/ClipPlanesEvaluator";
import { MapViewUtils } from "../lib/Utils";

describe("ClipPlanesEvaluator sphereProjection", function () {
    const evaluator = new TiltViewClipPlanesEvaluator();
    const projection = sphereProjection;
    const vFov = 90;
    const camera = new THREE.PerspectiveCamera(vFov, 1, 0, 100);
    const geoTarget = new GeoCoordinates(0, 0);
    const heading = 0;
    const tilt = 0;

    MapViewUtils.getCameraRotationAtTarget(projection, geoTarget, heading, tilt, camera.quaternion);
    interface Test {
        zoomLevel: number;
        far: number;
        near: number;
    }
    const tests: Test[] = [
        { zoomLevel: 1, far: 24956665, near: 13357073 },
        { zoomLevel: 2, far: 13997683, near: 6659490 },
        { zoomLevel: 3, far: 7885283, near: 3318512 },
        { zoomLevel: 4, far: 4360158, near: 1653812 },
        { zoomLevel: 5, far: 1716548, near: 832340 },
        { zoomLevel: 6, far: 699598, near: 417840 },
        { zoomLevel: 7, far: 328748, near: 208891 },
        { zoomLevel: 8, far: 160029, near: 104210 },
        { zoomLevel: 9, far: 79011, near: 51828 },
        { zoomLevel: 10, far: 39261, near: 25628 },
        { zoomLevel: 11, far: 19568, near: 12526 },
        { zoomLevel: 12, far: 9766, near: 5974 },
        { zoomLevel: 13, far: 4876, near: 2698 },
        { zoomLevel: 14, far: 2433, near: 1060 },
        { zoomLevel: 15, far: 1213, near: 241 },
        { zoomLevel: 16, far: 605, near: 1 },
        { zoomLevel: 17, far: 302, near: 1 },
        { zoomLevel: 18, far: 151, near: 1 },
        { zoomLevel: 19, far: 76, near: 1 },
        { zoomLevel: 20, far: 38, near: 1 }
    ];
    tests.forEach((test: Test) => {
        it("evaluateClipPlanes", function () {
            const canvasHeight = 500;
            const focalLength = MapViewUtils.calculateFocalLengthByVerticalFov(
                THREE.MathUtils.degToRad(vFov),
                canvasHeight
            );
            const distance = MapViewUtils.calculateDistanceFromZoomLevel(
                { focalLength },
                test.zoomLevel
            );
            MapViewUtils.getCameraPositionFromTargetCoordinates(
                geoTarget,
                distance,
                heading,
                tilt,
                projection,
                camera.position
            );
            camera.updateMatrix();
            const viewRange = evaluator.evaluateClipPlanes(camera, projection);
            expect(Math.round(viewRange.far)).eq(test.far);
            expect(Math.round(viewRange.near)).eq(test.near);
        });
    });
});
