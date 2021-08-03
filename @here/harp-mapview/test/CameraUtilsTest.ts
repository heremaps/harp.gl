/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import * as THREE from "three";

import { CameraUtils } from "../lib/CameraUtils";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
describe("CameraUtils", function () {
    it("compute horizontal and vertical fov", function () {
        const vFov = 60;
        const aspect = 0.9;
        const camera = new THREE.PerspectiveCamera(vFov, aspect);
        const hFov = THREE.MathUtils.radToDeg(CameraUtils.computeHorizontalFov(camera));
        CameraUtils.setHorizontalFov(camera, hFov);
        expect(camera.fov).to.be.closeTo(vFov, 1e-11);
    });
});
