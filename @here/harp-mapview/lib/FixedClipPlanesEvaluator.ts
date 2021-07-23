/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { Projection } from "@here/harp-geoutils";
import * as THREE from "three";

import { ClipPlanesEvaluator } from "./ClipPlanesEvaluator";
import { ElevationProvider } from "./ElevationProvider";

/**
 * Provides the most basic evaluation concept giving fixed values with some constraints.
 */
export class FixedClipPlanesEvaluator implements ClipPlanesEvaluator {
    readonly minFar: number;
    private m_nearPlane: number;
    private m_farPlane: number;

    constructor(readonly minNear: number = 1, readonly minFarOffset: number = 10) {
        this.minFar = minNear + minFarOffset;
        this.m_nearPlane = minNear;
        this.m_farPlane = this.minFar;
    }

    get nearPlane(): number {
        return this.m_nearPlane;
    }

    set nearPlane(fixedNear: number) {
        this.invalidatePlanes(fixedNear, this.m_farPlane);
    }

    get farPlane(): number {
        return this.m_farPlane;
    }

    set farPlane(fixedFar: number) {
        this.invalidatePlanes(this.m_nearPlane, fixedFar);
    }

    set minElevation(elevation: number) {}

    get minElevation(): number {
        // This evaluator does not support elevation so its always set to 0.
        return 0;
    }

    set maxElevation(elevation: number) {}

    get maxElevation(): number {
        // This evaluator does not support elevation so its always set to 0.
        return 0;
    }

    /** @override */
    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection,
        elevationProvider?: ElevationProvider
    ): ViewRanges {
        // We do not need to perform actual evaluation cause results are precomputed and
        // kept stable until somebody changes the properties.
        const viewRanges: ViewRanges = {
            near: this.m_nearPlane,
            far: this.m_farPlane,
            minimum: this.minNear,
            maximum: this.m_farPlane
        };
        return viewRanges;
    }

    private invalidatePlanes(near: number, far: number) {
        // When clamping prefer to extend far plane at about minimum distance, giving
        // near distance setup priority over far.
        const nearDist: number = Math.max(this.minNear, near);
        const farDist: number = Math.max(this.minFar, far, nearDist + this.minFarOffset);
        this.m_nearPlane = nearDist;
        this.m_farPlane = farDist;
    }
}
