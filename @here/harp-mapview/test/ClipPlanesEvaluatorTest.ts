/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import { TiltViewClipPlanesEvaluator } from "../lib/ClipPlanesEvaluator";
import { MapViewUtils } from "../lib/Utils";

describe("ClipPlanesEvaluator sphereProjection", function() {
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
        { zoomLevel: 5, far: 2344734, near: 824584 },
        { zoomLevel: 6, far: 1232077, near: 411266 },
        { zoomLevel: 7, far: 638787, near: 205063 },
        { zoomLevel: 8, far: 329674, near: 102115 },
        { zoomLevel: 9, far: 170504, near: 50699 },
        { zoomLevel: 10, far: 88833, near: 25016 },
        { zoomLevel: 11, far: 46837, near: 12189 },
        { zoomLevel: 12, far: 25100, near: 5785 },
        { zoomLevel: 13, far: 13731, near: 2589 },
        { zoomLevel: 14, far: 7697, near: 995 },
        { zoomLevel: 15, far: 4435, near: 201 },
        { zoomLevel: 16, far: 2633, near: 1 },
        { zoomLevel: 17, far: 1611, near: 1 },
        { zoomLevel: 18, far: 907, near: 1 },
        { zoomLevel: 19, far: 453, near: 1 },
        { zoomLevel: 20, far: 227, near: 1 }
    ];
    tests.forEach((test: Test) => {
        it("evaluateClipPlanes", function() {
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
