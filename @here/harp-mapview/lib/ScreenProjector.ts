/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * @hidden
 * Handles the projection of world coordinates to screen coordinates.
 */
export class ScreenProjector {
    static tempV2 = new THREE.Vector2();
    static tempV3 = new THREE.Vector3();

    private readonly m_projectionViewMatrix = new THREE.Matrix4();
    private readonly m_viewMatrix = new THREE.Matrix4();
    private readonly m_cameraPosition = new THREE.Vector3();
    private readonly m_center = new THREE.Vector3();
    private m_width: number = 0;
    private m_height: number = 0;
    // tslint:disable-next-line:no-unused-variable
    private m_nearClipPlane: number = 0;
    // tslint:disable-next-line:no-unused-variable
    private m_farClipPlane: number = 0;

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
     * Apply current projectionViewMatrix of the camera to project the source vector into screen
     * coordinates.
     *
     * @param {(THREE.Vector3 | THREE.Vector4)} source The source vector to project.
     * @param {THREE.Vector3} target The target vector.
     * @returns {THREE.Vector3} The projected vector (the parameter 'target').
     */
    project(
        source: THREE.Vector3,
        target: THREE.Vector2 = new THREE.Vector2()
    ): THREE.Vector2 | undefined {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        if (p.z > 0 && p.z < 1) {
            target.set((p.x * this.m_width) / 2, (p.y * this.m_height) / 2);
            return target;
        }
        return undefined;
    }

    /**
     * Apply current projectionViewMatrix of the camera to project the source vector. Stores result
     * in NDC in the target vector.
     *
     * @param {(THREE.Vector3 | THREE.Vector4)} source The source vector to project.
     * @param {THREE.Vector3} target The target vector.
     * @returns {THREE.Vector3} The projected vector (the parameter 'target').
     */
    projectVector(source: THREE.Vector3 | THREE.Vector4, target: THREE.Vector3): THREE.Vector3 {
        target.x = source.x - this.m_center.x - this.m_cameraPosition.x;
        target.y = source.y - this.m_center.y - this.m_cameraPosition.y;
        target.z = source.z - this.m_center.z - this.m_cameraPosition.z;
        target.applyMatrix4(this.m_projectionViewMatrix);
        return target;
    }

    /**
     * Project the 3D source point to a 2D screen point.
     *
     * @param {THREE.Vector3} source Point to project.
     * @param {THREE.Vector2} target 2D screen point to initialize.
     * @returns {(THREE.Vector2 | undefined)} Result or `undefined` if point is not between near and
     *      far plane.
     */
    projectInPlace(source: THREE.Vector3, target: THREE.Vector2): THREE.Vector2 | undefined {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        if (p.z > 0 && p.z < 1) {
            target.set((p.x * this.m_width) / 2, (p.y * this.m_height) / 2);
            return target;
        }
        return undefined;
    }

    /**
     * Fast test to check if projected point is on screen.
     *
     * @returns {boolean} `true` if point is on screen, `false` otherwise.
     */
    onScreen(source: THREE.Vector3): boolean {
        const p = this.projectVector(source, ScreenProjector.tempV3);
        if (p.z > 0 && p.z < 1) {
            return p.x >= -1 && p.x <= 1 && p.y >= -1 && p.y <= 1;
        }
        return false;
    }

    /**
     * Update the `ScreenProjector` with the latest values of the screen and the camera.
     *
     * @param {THREE.Camera} camera The current camera.
     * @param {THREE.Vector3} center Center of the world.
     * @param {number} width Width of screen/canvas.
     * @param {number} height Height of screen/canvas.
     */
    update(camera: THREE.Camera, center: THREE.Vector3, width: number, height: number) {
        this.m_width = width;
        this.m_height = height;
        if (camera instanceof THREE.PerspectiveCamera) {
            this.m_nearClipPlane = camera.near;
            this.m_farClipPlane = camera.far;
        }
        this.m_center.copy(center);
        this.m_viewMatrix.makeRotationFromQuaternion(camera.quaternion);
        this.m_viewMatrix.transpose();
        this.m_cameraPosition.copy(camera.position);
        this.m_projectionViewMatrix.multiplyMatrices(camera.projectionMatrix, this.m_viewMatrix);
    }
}
