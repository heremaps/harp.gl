/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */

import { mercatorProjection } from "@here/harp-geoutils";
import { expect } from "chai";
import * as THREE from "three";

import { FixedClipPlanesEvaluator } from "../lib/FixedClipPlanesEvaluator";

describe("FixedClipPlanesEvaluator", function () {
    it("constructor sets valid default clip planes", function () {
        const evaluator = new FixedClipPlanesEvaluator();
        expect(evaluator.nearPlane).gt(0);
        expect(evaluator.farPlane).gt(evaluator.nearPlane);
    });

    it("constructor initializes properties", function () {
        const minNear = 3;
        const minFarOffset = 42;
        const evaluator = new FixedClipPlanesEvaluator(minNear, minFarOffset);

        expect(evaluator.nearPlane).equals(minNear);
        expect(evaluator.minFar).equals(minNear + minFarOffset);
        expect(evaluator.farPlane).equals(evaluator.minFar);
    });

    it("elevation setters do nothing", function () {
        const evaluator = new FixedClipPlanesEvaluator();

        expect(evaluator.minElevation).eq(0);
        expect(evaluator.maxElevation).eq(0);

        evaluator.minElevation = 42;
        evaluator.maxElevation = 50;

        expect(evaluator.minElevation).eq(0);
        expect(evaluator.maxElevation).eq(0);
    });

    it("evaluateClipPlanes returns expected view ranges", function () {
        const minNear = 2;
        const minFarOffset = 30;
        const near = 20;
        const far = 1000;
        const evaluator = new FixedClipPlanesEvaluator(minNear, minFarOffset);
        evaluator.nearPlane = near;
        evaluator.farPlane = far;
        const viewRanges = evaluator.evaluateClipPlanes(new THREE.Camera(), mercatorProjection);

        expect(viewRanges.near).equals(near);
        expect(viewRanges.far).equals(far);
        expect(viewRanges.minimum).equals(minNear);
        expect(viewRanges.maximum).equals(far);
    });

    it("evaluateClipPlanes returns near/far clamped by constraints", function () {
        const minNear = 50;
        const minFarOffset = 100;
        const near = 10;
        const far = 60;
        const evaluator = new FixedClipPlanesEvaluator(minNear, minFarOffset);
        evaluator.nearPlane = near;
        evaluator.farPlane = far;
        const viewRanges = evaluator.evaluateClipPlanes(new THREE.Camera(), mercatorProjection);

        expect(viewRanges.near).equals(minNear);
        expect(viewRanges.far).equals(evaluator.minFar);
    });
});
