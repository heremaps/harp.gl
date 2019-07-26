/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, Projection, ProjectionType } from "@here/harp-geoutils";
import { assert } from "@here/harp-utils";
import * as THREE from "three";

export interface ClipPlanesEvaluator {
    /**
     * Compute near and far clipping planes distance.
     *
     * Evaluation method should be called on every frame  and camera clip planes updated.
     * This is related to evaluator implementation and its input data, that may suddenly change
     * such as camera position or angle, projection type or so.
     * Some evaluators may not depend on all or even any of input objects, but to preserve
     * compatibility with any evaluator type it is strongly reccomended to update on every frame.
     * @param camera The [[THREE.Camera]] object used in scene which clipping planes are evaluated.
     * @param projection The current [[Projection]] method.
     * @note Camera clipping planes should be not automatically updated via #evaluateClipPlanes()
     * call, user should do it manually if needed.
     */
    evaluateClipPlanes(camera: THREE.Camera, projection: Projection): { near: number; far: number };
}

/**
 * Simple camera clip planes evaluator that computes near plance based on ground distance.
 *
 * This evaluator supports both planar and spherical projections, although it behaviour is
 * slightly different in each case. General algorithm setups near plane in between camera and
 * ground level, while far plane is just calculated using scale and bias approach with far offset
 * and multiplier.
 */
export class GroundBasedClipPlanesEvaluator implements ClipPlanesEvaluator {
    readonly farMin: number;

    protected m_tmpVectors: THREE.Vector3[] = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ];
    protected m_tmpQuaternion: THREE.Quaternion = new THREE.Quaternion();

    constructor(
        readonly nearMin: number = 0.1,
        readonly nearMultiplier: number = 0.1,
        readonly nearFarMultiplier = 50.0,
        readonly farOffset = 200.0
    ) {
        assert(nearMin > 0);
        assert(nearFarMultiplier >= 0);
        assert(farOffset >= 0);
        this.farMin = nearMin * nearFarMultiplier + farOffset;
    }

    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        let nearPlane: number = this.nearMin;
        let farPlane: number = this.farMin;
        if (projection.type === ProjectionType.Spherical) {
            // near and far plane for a set up where
            // the camera is looking at the center of the scene.
            const r = EarthConstants.EQUATORIAL_RADIUS;
            const d = camera.position.length();
            const alpha = Math.asin(r / d);
            // Extract X, Y, Z axes into tmp vectors array.
            camera.matrixWorld.extractBasis(
                this.m_tmpVectors[0],
                this.m_tmpVectors[1],
                this.m_tmpVectors[2]
            );
            // Setup quaternion based on X axis.
            this.m_tmpQuaternion.setFromAxisAngle(this.m_tmpVectors[0], alpha);
            // Acquire forward vector based on Z axis reversed (keep it in tmpVectors[2]).
            const fwd = this.m_tmpVectors[2].negate();
            // Apply quaternion rotation to forward vector, store it in tmpVectors[1].
            const fwdRot = this.m_tmpVectors[1].copy(fwd).applyQuaternion(this.m_tmpQuaternion);
            // Store camera position tmpVectors[0] and reference it with p.
            const p = this.m_tmpVectors[0].copy(camera.position);
            p.addScaledVector(fwdRot, Math.sqrt(d * d - r * r));
            farPlane = p.sub(camera.position).dot(fwd);
            const bias = 2000; // TODO: generalize.
            nearPlane = Math.max(this.nearMin, projection.groundDistance(camera.position) - bias);
        } else {
            const groundDistance = projection.groundDistance(camera.position);
            nearPlane = Math.max(this.nearMin, groundDistance * this.nearMultiplier);
            // Will be already clamped to minFar due to clamping above.
            farPlane = nearPlane * this.nearFarMultiplier + this.farOffset;
        }
        return { near: nearPlane, far: farPlane };
    }
}

/**
 * Evaluates camera clipping planes based on the eye vector angle with surface of the ground.
 */
export class TiltBasedClipPlanesEvaluator extends GroundBasedClipPlanesEvaluator {
    private static readonly EYE_INVERSE = new THREE.Vector3(0, 0, -1);

    constructor() {
        super();
    }

    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        const clipPlanes = super.evaluateClipPlanes(camera, projection);

        // Tilt angle will be taken into consideration only for non-spherical projections,
        // otherwise take super class values.
        if (projection.type !== ProjectionType.Spherical) {
            camera.getWorldDirection(this.m_tmpVectors[0]);
            // tslint:disable-next-line:no-unused-variable
            const angle = THREE.Math.radToDeg(
                this.m_tmpVectors[0].angleTo(TiltBasedClipPlanesEvaluator.EYE_INVERSE)
            );
            // TODO: Implement camera angle based planes interpolation.
            // ...
            // Old implementation was just clamping default (base) results,
            // this gonna be replaced by something smarter:
            clipPlanes.near = Math.max(clipPlanes.near, 20);
            clipPlanes.far = Math.max(clipPlanes.far, 2000);

            // Preserve limits inherited from default implementation.
            clipPlanes.near = Math.max(this.nearMin, clipPlanes.near);
            clipPlanes.far = Math.max(
                clipPlanes.near * this.nearFarMultiplier + this.farOffset,
                clipPlanes.far
            );
        }
        return clipPlanes;
    }
}

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

    evaluateClipPlanes(
        camera: THREE.Camera,
        projection: Projection
    ): { near: number; far: number } {
        // We do not need to perform actual evaluation cause results are precomputed and
        // kept stable until somebody changes the properties.
        return { near: this.m_nearPlane, far: this.m_farPlane };
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

/**
 * Default [[ClipPlanesEvaluator]] calculates near plane based on ground distance.
 */
export const defaultClipPlanesEvaluator: ClipPlanesEvaluator = new GroundBasedClipPlanesEvaluator();
