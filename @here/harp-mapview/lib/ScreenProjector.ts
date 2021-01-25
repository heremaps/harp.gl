/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vector3Like } from "@here/harp-geoutils";
import * as THREE from "three";

/**
 * Determines whether a position in NDC (Normalized Device Coordinates) is inside the screen.
 * @param ndc - The position to check.
 */
function isOnScreen(ndc: THREE.Vector3) {
    return ndc.z > -1 && ndc.z < 1 && ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1;
}

/**
 * Determines whether a position in NDC (Normalized Device Coordinates) is between the near
 * and far plane.
 * @param ndc - The position to check.
 */
function isInRange(ndc: THREE.Vector3) {
    return ndc.z > -1 && ndc.z < 1;
}

/**
 * @hidden
 * Handles the projection of world coordinates to screen coordinates.
 */
export class ScreenProjector {
    static tempV2 = new THREE.Vector2();
    static tempV3 = new THREE.Vector3();

    private m_width: number = 0;
    private m_height: number = 0;

    /**
     * Constructs a new `ScreenProjector`.
     *
     * @param m_camera - Camera to project against.
     */
    constructor(private m_camera: THREE.Camera) {}

    /**
     * Height of the screen.
     */
    get width(): number {
        return this.m_width;
    }

    /**
     * Width of the screen.
     */
    get height(): number {
        return this.m_height;
    }

    /**
     * Apply current projectionViewMatrix of the camera to project the source vector into
     * screen coordinates.
     *
     * @param {(Vector3Like)} source The source vector to project.
     * @param {THREE.Vector2} target The target vector.
     * @returns {THREE.Vector2} The projected vector (the parameter 'target')
     */
    project(
        source: Vector3Like,
        target: THREE.Vector2 = new THREE.Vector2()
    ): THREE.Vector2 | undefined {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        return this.ndcToScreen(p, target);
    }

    /**
     * Apply current projectionViewMatrix of the camera to project the source vector into
     * screen coordinates.
     *
     * @param {(Vector3Like)} source The source vector to project.
     * @param {THREE.Vector2} target The target vector.
     * @returns {THREE.Vector2} The projected vector (the parameter 'target') or undefined if
     * outside of the near/far plane. The point may be outside the screen.
     */
    projectToScreen(
        source: Vector3Like,
        target: THREE.Vector2 = new THREE.Vector2()
    ): THREE.Vector2 | undefined {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        if (isInRange(p)) {
            return this.ndcToScreen(p, target);
        }
        return undefined;
    }

    /**
     * Test if the area around the specified point is visible on the screen.
     *
     * @param {(Vector3Like)} source The centered source vector to project.
     * @param {(Number)} halfWidth Half of the width of the area in screen space [0..1].
     * @param {(Number)} halfHeight Half of the height of the area in screen space [0..1].
     * @param {THREE.Vector2} target The target vector.
     * @returns {THREE.Vector2} The projected vector (the parameter 'target') or undefined if
     * the area is completely outside the screen.
     */
    projectAreaToScreen(
        source: Vector3Like,
        halfWidth: number,
        halfHeight: number,
        target: THREE.Vector2 = new THREE.Vector2()
    ): THREE.Vector2 | undefined {
        halfWidth *= 2;
        halfHeight *= 2;
        const p = this.projectVector(source, ScreenProjector.tempV3);
        if (
            isInRange(p) &&
            p.x + halfWidth >= -1 &&
            p.x - halfWidth <= 1 &&
            p.y + halfHeight >= -1 &&
            p.y - halfHeight <= 1
        ) {
            return this.ndcToScreen(p, target);
        }
        return undefined;
    }

    /**
     * Apply current projectionViewMatrix of the camera to project the source vector into
     * screen coordinates. The z component between -1 and 1 is also returned.
     *
     * @param {(Vector3Like)} source The source vector to project.
     * @param {THREE.Vector3} target The target vector.
     * @returns {THREE.Vector3} The projected vector (the parameter 'target') or undefined if
     * outside the near / far plane.
     */
    project3(
        source: Vector3Like,
        target: THREE.Vector3 = new THREE.Vector3()
    ): THREE.Vector3 | undefined {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        if (p.z > -1 && p.z < 1) {
            target.set((p.x * this.m_width) / 2, (p.y * this.m_height) / 2, p.z);
            return target;
        }
        return undefined;
    }

    /**
     * Apply current projectionViewMatrix of the camera to project the source vector. Stores
     * result in NDC in the target vector.
     *
     * @param {(Vector3Like)} source The source vector to project.
     * @param {THREE.Vector3} target The target vector.
     * @returns {THREE.Vector3} The projected vector (the parameter 'target').
     */
    projectVector(source: Vector3Like, target: THREE.Vector3): THREE.Vector3 {
        target.set(source.x, source.y, source.z).project(this.m_camera);
        return target;
    }

    /**
     * Fast test to check if projected point is on screen.
     *
     * @returns {boolean} `true` if point is on screen, `false` otherwise.
     */
    onScreen(source: Vector3Like): boolean {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        return isOnScreen(p);
    }

    /**
     * Update the `ScreenProjector` with the latest values of the screen and the camera.
     *
     * @param {THREE.Camera} camera Camera to project against.
     * @param {number} width Width of screen/canvas.
     * @param {number} height Height of screen/canvas.
     */
    update(camera: THREE.Camera, width: number, height: number) {
        this.m_camera = camera;
        this.m_width = width;
        this.m_height = height;
    }

    private ndcToScreen(ndc: THREE.Vector3, screenCoords: THREE.Vector2): THREE.Vector2 {
        return screenCoords.set((ndc.x * this.m_width) / 2, (ndc.y * this.m_height) / 2);
    }
}
