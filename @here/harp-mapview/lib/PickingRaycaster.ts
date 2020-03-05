/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, ProjectionType } from "@here/harp-geoutils";
import * as THREE from "three";
import { MapView } from "./MapView";

/**
 * Raycasting points is not supported as necessary in Three.js. This class extends a
 * [[THREE.Raycaster]] and adds the width / height of the canvas to allow picking of screen space
 * geometry.
 *
 * @internal
 */
export class PickingRaycaster extends THREE.Raycaster {
    private readonly m_plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
    private readonly m_sphere = new THREE.Sphere(undefined, EarthConstants.EQUATORIAL_RADIUS);

    /**
     * Constructor.
     *
     * @param width the canvas width.
     * @param height the canvas height.
     */
    constructor(
        public width: number,
        public height: number,
        private readonly m_mapView: MapView,
        private readonly m_camera: THREE.Camera
    ) {
        super();
    }

    /**
     * Updates the ray with a new direction.
     * @param ndcCoords 2D normalized device coordinates (NDC).
     */
    setDirection(ndcCoords: { x: number; y: number }): void {
        this.setFromCamera(ndcCoords, this.m_camera);
    }

    /**
     * Intersects ground
     * @param x screen x
     * @param y screen y
     * @param [useElevation]
     * @param [outWorldPos]
     * @returns ground
     */
    intersectGround(
        x: number,
        y: number,
        useElevation: boolean = false,
        outWorldPos: THREE.Vector3 = new THREE.Vector3()
    ): THREE.Vector3 | undefined {
        if (useElevation && this.m_mapView.elevationProvider) {
            // TODO: Add interface to pass raycaster directly.
            return this.m_mapView.elevationProvider.rayCast(x, y);
        }
        const result =
            this.m_mapView.projection.type === ProjectionType.Spherical
                ? this.ray.intersectSphere(this.m_sphere, outWorldPos)
                : this.ray.intersectPlane(this.m_plane, outWorldPos);
        return result ?? undefined;
    }
}
