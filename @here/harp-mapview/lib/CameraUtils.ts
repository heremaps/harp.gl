/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { MAX_FOV_DEG, MIN_FOV_DEG } from "./FovCalculation";

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
     * @param hFov - The horizontal field of view in degrees.
     */
    export function setHorizontalFov(camera: THREE.PerspectiveCamera, hFov: number): void {
        camera.fov = THREE.MathUtils.radToDeg(
            2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hFov) / 2) / camera.aspect)
        );
    }

    /**
     * Sets a camera's vertical field of view.
     * @internal
     *
     * @param camera
     * @param fov - The vertical field of view in degress.
     */
    export function setVerticalFov(camera: THREE.PerspectiveCamera, fov: number): void {
        camera.fov = THREE.MathUtils.clamp(fov, MIN_FOV_DEG, MAX_FOV_DEG);

        let hFov = THREE.MathUtils.radToDeg(computeHorizontalFov(camera));

        if (hFov > MAX_FOV_DEG || hFov < MIN_FOV_DEG) {
            hFov = THREE.MathUtils.clamp(hFov, MIN_FOV_DEG, MAX_FOV_DEG);
            setHorizontalFov(camera, hFov);
        }
    }

    /**
     * Computes a camera's focal length for a given viewport height.
     * @beta
     *
     * @param vFov - Vertical field of view in degress.
     * @param height - Viewport height in pixels.
     * @returns focal length in pixels.
     */
    export function computeFocalLength(vFov: number, height: number): number {
        return height / 2 / Math.tan(THREE.MathUtils.degToRad(vFov) / 2);
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

    /**
     * Get perspective camera frustum planes distances to the camera's principal ray.
     * @beta
     * @returns all plane distances in helper object.
     */
    export function getFrustumPlaneDistances(
        camera: THREE.PerspectiveCamera
    ): { left: number; right: number; top: number; bottom: number; near: number; far: number } {
        const near = camera.near;
        const far = camera.far;
        let top = (near * Math.tan(THREE.MathUtils.degToRad(0.5 * camera.fov))) / camera.zoom;
        let height = 2 * top;
        let width = camera.aspect * height;
        let left = -0.5 * width;

        const view = camera.view;
        if (view !== null && view.enabled) {
            const fullWidth = view.fullWidth;
            const fullHeight = view.fullHeight;

            left += (view.offsetX * width) / fullWidth;
            top -= (view.offsetY * height) / fullHeight;
            width *= view.width / fullWidth;
            height *= view.height / fullHeight;
        }

        // Correct by skew factor
        left += camera.filmOffset !== 0 ? (near * camera.filmOffset) / camera.getFilmWidth() : 0;

        return {
            left,
            right: left + width,
            top,
            bottom: top - height,
            near,
            far
        };
    }
}
