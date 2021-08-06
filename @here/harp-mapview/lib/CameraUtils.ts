/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { MAX_FOV_RAD, MIN_FOV_RAD } from "./FovCalculation";

export namespace CameraUtils {
    /**
     * Computes a camera's vertical field of view for given focal length and viewport height.
     * @beta
     *
     * @param focalLength - Focal length in pixels (see {@link computeFocalLength})
     * @param height - Viewport height in pixels.
     * @returns Vertical field of view in radians.
     */
    export function computeVerticalFov(focalLength: number, height: number): number {
        return 2 * Math.atan(height / 2 / focalLength);
    }

    /**
     * Computes a camera's horizontal field of view.
     * @beta
     *
     * @param camera
     * @returns Horizontal field of view in radians.
     */
    export function computeHorizontalFov(camera: THREE.PerspectiveCamera): number {
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        return 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    }

    /**
     * Set a camera's horizontal field of view.
     * @internal
     *
     * @param camera
     * @param hFov - The horizontal field of view in radians.
     */
    export function setHorizontalFov(camera: THREE.PerspectiveCamera, hFov: number): void {
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hFov / 2) / camera.aspect));
    }

    /**
     * Sets a camera's vertical field of view.
     * @internal
     *
     * @param camera
     * @param fov - The vertical field of view in radians.
     */
    export function setVerticalFov(camera: THREE.PerspectiveCamera, fov: number): void {
        camera.fov = THREE.MathUtils.radToDeg(THREE.MathUtils.clamp(fov, MIN_FOV_RAD, MAX_FOV_RAD));

        let hFov = computeHorizontalFov(camera);

        if (hFov > MAX_FOV_RAD || hFov < MIN_FOV_RAD) {
            hFov = THREE.MathUtils.clamp(hFov, MIN_FOV_RAD, MAX_FOV_RAD);
            setHorizontalFov(camera, hFov);
        }
    }

    /**
     * Computes a camera's focal length for a given viewport height.
     * @beta
     *
     * @param vFov - Vertical field of view in radians.
     * @param height - Viewport height in pixels.
     * @returns focal length in pixels.
     */
    export function computeFocalLength(vFov: number, height: number): number {
        return height / 2 / Math.tan(vFov / 2);
    }

    /**
     * Calculates object's screen size based on the focal length and it's camera distance.
     * @beta
     *
     * @param focalLength - Focal length in pixels (see {@link computeFocalLength})
     * @param distance - Object distance in world space.
     * @param worldSize - Object size in world space.
     * @return object size in screen space.
     */
    export function convertWorldToScreenSize(
        focalLength: number,
        distance: number,
        worldSize: number
    ): number {
        return (focalLength * worldSize) / distance;
    }

    /**
     * Calculates object's world size based on the focal length and it's camera distance.
     * @beta
     *
     * @param focalLength - Focal length in pixels (see {@link computeFocalLength})
     * @param distance - Object distance in world space.
     * @param screenSize - Object size in screen space.
     * @return object size in world space.
     */
    export function convertScreenToWorldSize(
        focalLength: number,
        distance: number,
        screenSize: number
    ): number {
        return (distance * screenSize) / focalLength;
    }
}
