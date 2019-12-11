/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { Vector3Like } from "@here/harp-geoutils";
import * as sinon from "sinon";
import * as THREE from "three";
import { ScreenProjector } from "../lib/ScreenProjector";

/**
 * Creates a fake projector that takes as input NDC coordinates (from -1 to 1) and outputs screen
 * coordinates.
 * @param sandbox Sinon sandbox used to track created stubs.
 * @param screenWidth Screen width in pixels.
 * @param screenHeight Screen height in pixels.
 * @returns Screen projector stub.
 */
export function stubScreenProjector(
    sandbox: sinon.SinonSandbox,
    screenWidth: number,
    screenHeight: number
): ScreenProjector {
    const camera = new THREE.PerspectiveCamera();
    const screenProjector = new ScreenProjector(camera);
    screenProjector.update(camera, screenWidth, screenHeight);

    sandbox
        .stub(screenProjector, "projectVector")
        .callsFake(function(source: Vector3Like, target: THREE.Vector3) {
            target.set(source.x, source.y, source.z);
            return target;
        });
    return screenProjector;
}
