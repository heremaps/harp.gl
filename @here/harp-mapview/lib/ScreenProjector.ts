/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { MapView } from "./MapView";

/**
 * @hidden
 * Handles the projection of world coordinates to screen coordinates.
 */
export class ScreenProjector {
    static tempV2 = new THREE.Vector2();
    static tempV3 = new THREE.Vector3();

    private m_width: number = 0;
    private m_height: number = 0;
    private m_mapView?: MapView;

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
        if (p.z > -1 && p.z < 1) {
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
        target.set(source.x, source.y, source.z).project(this.m_mapView!.camera);
        return target;
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
     * @param {MapView} mapView The current mapView.
     * @param {number} width Width of screen/canvas.
     * @param {number} height Height of screen/canvas.
     */
    update(mapView: MapView, width: number, height: number) {
        this.m_width = width;
        this.m_height = height;
        this.m_mapView = mapView;
    }
}
