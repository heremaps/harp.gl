/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { DEFAULT_MONOMIAL_POWER, SkyGradientTexture } from "./SkyGradientTexture";

/**
 * Generates a texture gradient and allows updates to its y-offset.
 *
 * To position the texture correctly, this class reads the value of the four corners of the far
 * clipping plane and calculates the intersection between the line that divides the far clipping
 * plane in to two equal parts, and the ground plane. This intersection point is called
 * `horizonPosition`, and it determines the texture's y-offset.
 *
 * See also [[SkyGradientTexture]].
 */
export class SkyBackground {
    private m_gradient: SkyGradientTexture;
    private m_farClipPlaneDividedVertically: THREE.Line3;
    private m_groundPlane: THREE.Plane;
    private m_bottomMidFarPoint: THREE.Vector3;
    private m_topMidFarPoint: THREE.Vector3;
    private m_horizonPosition: THREE.Vector3;
    private m_farClipPlaneCorners: THREE.Vector3[];

    /**
     * Constructs a `SkyBackground` instance.
     *
     * @param m_topColor Defines the color of the upper part of the gradient.
     * @param m_bottomColor Defines the color of bottom part of the gradient, that touches the
     * ground.
     * @param m_groundColor Defines the color of the first pixel of the gradient, from the bottom.
     * @param camera Required to calculate the texture's offset.
     * @param m_monomialPower Defines the texture's gradient power.
     *
     * @example
     * ```TypeScript
     * // This creates a texture gradient and uses it as background of the scene.
     * this.m_skyBackground = new SkyBackground(
     *     new THREE.Color("#FF000"),
     *     new THREE.Color("#0000FF"),
     *     new THREE.Color("#F8FBFD"),
     *     this.camera
     * );
     * this.m_scene.background = this.m_skyBackground.texture;
     *
     * // Then, when the camera moves at runtime, the skyBackground needs to be updated.
     * this.m_skyBackground.update(this.m_camera);
     * ```
     */
    constructor(
        private m_topColor: THREE.Color,
        private m_bottomColor: THREE.Color,
        private m_groundColor: THREE.Color,
        camera: THREE.Camera,
        private m_monomialPower: number = DEFAULT_MONOMIAL_POWER
    ) {
        this.m_gradient = new SkyGradientTexture(
            m_topColor,
            m_bottomColor,
            m_groundColor,
            m_monomialPower
        );
        this.m_farClipPlaneDividedVertically = new THREE.Line3();
        this.m_groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
        this.m_bottomMidFarPoint = new THREE.Vector3();
        this.m_topMidFarPoint = new THREE.Vector3();
        this.m_horizonPosition = new THREE.Vector3();
        this.m_farClipPlaneCorners = [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ];

        this.update(camera);
    }

    /**
     * Missing Typedoc
     */
    get topColor(): THREE.Color {
        return this.m_topColor;
    }

    /**
     * Missing Typedoc
     */
    get bottomColor(): THREE.Color {
        return this.m_bottomColor;
    }

    /**
     * Missing Typedoc
     */
    get groundColor(): THREE.Color {
        return this.m_groundColor;
    }

    /**
     * Missing Typedoc
     */
    get monomialPower(): number {
        return this.m_monomialPower;
    }

    /**
     * Missing Typedoc
     */
    get texture(): THREE.DataTexture {
        return this.m_gradient.texture;
    }

    /**
     * Missing Typedoc
     */
    get horizon(): THREE.Vector3 {
        return this.m_horizonPosition;
    }

    /**
     * This method updates the position of the texture depending on the camera frustum.
     *
     * @param camera The camera used in the map view.
     */
    update(camera: THREE.Camera) {
        this.setHorizonPosition(camera);
        this.updateTexturePosition();
    }

    /**
     * Updates the sky texture with new colors.
     *
     * @param topColor Color at the zenith.
     * @param bottomColor Color at the horizon.
     * @param groundColor This color should match the renderer's clear color in the theme.
     */
    updateColors(topColor: THREE.Color, bottomColor: THREE.Color, groundColor: THREE.Color) {
        this.m_topColor = topColor;
        this.m_bottomColor = bottomColor;
        this.m_groundColor = groundColor;
        this.m_gradient.update(topColor, bottomColor, groundColor);
    }

    private setHorizonPosition(camera: THREE.Camera) {
        this.setFarPlaneCornersFromCamera(camera, this.m_farClipPlaneCorners);
        const bottomLeftFarCorner = this.m_farClipPlaneCorners[0];
        const bottomRightFarCorner = this.m_farClipPlaneCorners[1];
        const topLeftFarCorner = this.m_farClipPlaneCorners[2];
        const topRightFarCorner = this.m_farClipPlaneCorners[3];

        this.setMidPoint(bottomLeftFarCorner, bottomRightFarCorner, this.m_bottomMidFarPoint);
        this.setMidPoint(topLeftFarCorner, topRightFarCorner, this.m_topMidFarPoint);

        this.m_farClipPlaneDividedVertically.set(this.m_bottomMidFarPoint, this.m_topMidFarPoint);

        const hasIntersection = this.m_groundPlane.intersectLine(
            this.m_farClipPlaneDividedVertically,
            this.m_horizonPosition
        );

        // when there is no intersection between the ground plane and the
        // farClipPlaneDividedVertically, be sure that the horizon is reset. Otherwise a previous
        // intersection point stored in the m_horizonPosition will be considered the valid one.
        if (!hasIntersection) {
            this.m_horizonPosition.set(0.0, 0.0, 0.0);
        }
    }

    private updateTexturePosition() {
        const coveredBySky = this.m_bottomMidFarPoint.distanceTo(this.m_horizonPosition);
        const frustumHeight = this.m_farClipPlaneDividedVertically.distance();
        const skyRatio = coveredBySky / frustumHeight;
        // if there is no intersection between the ground plane and the line that defines the far
        // clip plane divided vertically, it means that there is no sky visible and therefore the
        // ground color should be displayed. When there is no intersection, the length of the
        // this.m_horizonPosition is still equal to zero, as threejs initialize an empty vector with
        // all the three components to zero.
        // If there is an intersection, calculate the offset.
        let ratio;
        if (this.m_horizonPosition.length() === 0) {
            ratio = 1;
        } else {
            const groundRatio = 1 / this.m_gradient.texture.image.height;
            ratio = skyRatio - groundRatio;
        }

        // if the bottom part of the far clipping plane is under the ground plane, scroll the
        // texture down. Otherwise, the camera is looking at the sky, therefore, scroll the texture
        // up.
        if (this.m_bottomMidFarPoint.z <= 0) {
            this.m_gradient.updateYOffset(-ratio);
        } else {
            this.m_gradient.updateYOffset(skyRatio);
        }
    }

    private setMidPoint(start: THREE.Vector3, end: THREE.Vector3, destination: THREE.Vector3) {
        destination.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    }

    private setFarPlaneCornersFromCamera(camera: THREE.Camera, corners: THREE.Vector3[]) {
        let cornerIndex = 0;

        function addPoint(x: number, y: number, z: number) {
            corners[cornerIndex++].set(x, y, z).unproject(camera);
        }

        const w = 1;
        const h = 1;
        const f = 1;

        addPoint(-w, -h, f);
        addPoint(w, -h, f);
        addPoint(-w, h, f);
        addPoint(w, h, f);
    }
}
