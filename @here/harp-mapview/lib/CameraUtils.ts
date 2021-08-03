/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

export namespace CameraUtils {
    const tmpV = new THREE.Vector2();

    /**
     * Computes a camera's horizontal field of view.
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
     *
     * @param camera
     * @param hFov - The horizontal field of view in radians.
     */
    export function setHorizontalFov(camera: THREE.PerspectiveCamera, hFov: number): void {
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hFov / 2) / camera.aspect));
    }
    /**
     * Computes a camera's focal length for a given viewport height.
     *
     * @param vFov - Vertical field of view in rad.
     * @param height - Viewport height in pixels.
     */
    export function computeFocalLength(camera: THREE.PerspectiveCamera, height: number): number {
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        return height / 2 / Math.tan(vFov / 2);
    }

    /**
     * Sets a camera's vertical field of view for given focal length and viewport height.
     *
     * @param focalLength - Focal length in pixels (see {@link computeFocalLength})
     * @param height - Viewport height in pixels.
     */
    export function setVerticalFov(
        camera: THREE.PerspectiveCamera,
        focalLength: number,
        height: number
    ): void {
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / focalLength));
    }

    /**
     * Calculates object's screen size based on the focal length and it's camera distance.
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
     * Returns the camera's principal point (intersection of principal ray and image plane)
     * in NDC coordinates.
     * @beta
     * @see https://en.wikipedia.org/wiki/Pinhole_camera_model
     * @remarks This point coincides with the principal vanishing point. By default it's located at
     * the image center (NDC coords [0,0]), and the resulting projection is centered or symmetric.
     * But it may be offset (@see THREE.PerspectiveCamera.setViewOffset) for some use cases such as
     * multiview setups (e.g. stereoscopic rendering), resulting in an asymmetric perspective
     * projection.
     * @param camera - The camera.
     * @param result - Optional vector where the principal point coordinates will be copied.
     * @returns A vector containing the principal point NDC coordinates.
     */
    export function getPrincipalPoint(
        camera: THREE.PerspectiveCamera,
        result: THREE.Vector2 = new THREE.Vector2()
    ): THREE.Vector2 {
        return result.set(
            -camera.projectionMatrix.elements[8],
            -camera.projectionMatrix.elements[9]
        );
    }

    /**
     * Sets the camera's principal point (intersection of principal ray and image plane)
     * in NDC coordinates.
     * @beta
     * @see {@link getPrincipalPoint}
     * @param camera - The camera.
     * @param ndcCoords - The principal point's NDC coordinates.
     */
    export function setPrincipalPoint(camera: THREE.PerspectiveCamera, ndcCoords: THREE.Vector2) {
        const height = 1;
        const width = camera.aspect;

        camera.setViewOffset(
            width,
            height,
            (-THREE.MathUtils.clamp(ndcCoords.x, -1, 1) * width) / 2,
            (THREE.MathUtils.clamp(ndcCoords.y, -1, 1) * height) / 2,
            width,
            height
        );
    }

    /**
     * Side FOV Angles (in radians) for a given camera setup.
     * @see {@link getSideFovs}
     */
    export interface SideFovs {
        top: number;
        bottom: number;
        left: number;
        right: number;
    }

    /**
     * Returns top, bottom, left and right fov angles for a given perspective camera.
     * @beta
     * @remarks In symmetric projections, the principal point coincides with the image center, and
     * the vertical and horizontal FOVs are each split at that point in two equal halves.
     * However, in asymmetric projections the principal point is not at the image center, and thus
     * each fov is split unevenly in two parts:
     *
     *    Symmetric projection        Asymmetric projection
     * -------------------------   --------------------------
     * |           ^           |   |       ^                |
     * |           |           |   |       |tFov            |
     * |           |tFov       |   | lFov  v      rFov      |
     * |           |           |   |<----->x<-------------->|
     * |    lFov   v   rFov    |   |  ppal ^ point          |
     * |<--------->x<--------->|   |       |    o           |
     * | ppal point=img center |   |       | img center     |
     * |           ^           |   |       |                |
     * |           |bFov       |   |       |bFov            |
     * |           |           |   |       |                |
     * |           v           |   |       v                |
     * -------------------------   --------------------------
     *
     * @param camera - The camera.
     * @param result - Optional vector where the side fovs will be copied.
     * @returns The four fov angles in radians.
     */
    export function getSideFovs(
        camera: THREE.PerspectiveCamera,
        result: SideFovs = { top: 0, bottom: 0, left: 0, right: 0 }
    ): SideFovs {
        const splitFov = (ppOffset: number, fovDeg: number): [number, number] => {
            const fov = THREE.MathUtils.degToRad(fovDeg);
            const halfFov = fov / 2;

            if (ppOffset === 0) {
                return [halfFov, halfFov];
            } else {
                const tanHFov = Math.tan(halfFov);
                const posSideFov = Math.atan((1 - ppOffset) * tanHFov);
                const negSideFov = fov - posSideFov;
                return [posSideFov, negSideFov];
            }
        };

        const principalPoint = getPrincipalPoint(camera, tmpV);

        [result.top, result.bottom] = splitFov(principalPoint.y, camera.fov);
        [result.right, result.left] = splitFov(principalPoint.x, camera.fov * camera.aspect);

        return result;
    }
}
