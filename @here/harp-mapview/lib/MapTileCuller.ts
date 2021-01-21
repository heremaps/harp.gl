/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Second step tile culling: Do additional check for intersection of box and frustum by checking if
 * the frustum is outside any plane of the tiles `bbox` (oriented, not AABB). It's in the inverse of
 * the standard frustum test, which excludes many cases where the large terrain tiles straddle the
 * planes of the frustum.
 *
 * @see http://www.iquilezles.org/www/articles/frustumcorrect/frustumcorrect.htm
 */
export class MapTileCuller {
    private m_globalFrustumMin = new THREE.Vector3();
    private m_globalFrustumMax = new THREE.Vector3();

    private readonly m_frustumCorners = [
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3(),
        new THREE.Vector3()
    ];

    /**
     * Constructs a `MapTileCuller`.
     *
     * @param m_camera - A `THREE.Camera`.
     */
    constructor(private readonly m_camera: THREE.Camera) {}

    /**
     * Sets up culling and computes frustum corners. You mus call this function before the culling
     * starts.
     */
    setup() {
        const frustumCorners = this.getFrustumCorners();

        const matrix = this.m_camera.matrixWorld;

        this.m_globalFrustumMin.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
        this.m_globalFrustumMax.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

        for (const frustumCorner of frustumCorners) {
            frustumCorner.applyMatrix4(matrix);

            this.m_globalFrustumMin.x = Math.min(this.m_globalFrustumMin.x, frustumCorner.x);
            this.m_globalFrustumMin.y = Math.min(this.m_globalFrustumMin.y, frustumCorner.y);
            this.m_globalFrustumMin.z = Math.min(this.m_globalFrustumMin.z, frustumCorner.z);

            this.m_globalFrustumMax.x = Math.max(this.m_globalFrustumMax.x, frustumCorner.x);
            this.m_globalFrustumMax.y = Math.max(this.m_globalFrustumMax.y, frustumCorner.y);
            this.m_globalFrustumMax.z = Math.max(this.m_globalFrustumMax.z, frustumCorner.z);
        }
    }

    /**
     * Checks if the tile's bounding box intersects with the current view's frustum.
     *
     * @param tileBounds - The bounding box for the tile.
     */
    frustumIntersectsTileBox(tileBounds: THREE.Box3): boolean {
        const globalFrustumMin = this.m_globalFrustumMin;
        const globalFrustumMax = this.m_globalFrustumMax;

        if (
            globalFrustumMax.x < tileBounds.min.x ||
            globalFrustumMax.y < tileBounds.min.y ||
            globalFrustumMax.z < tileBounds.min.z ||
            globalFrustumMin.x > tileBounds.max.x ||
            globalFrustumMin.y > tileBounds.max.y ||
            globalFrustumMin.z > tileBounds.max.z
        ) {
            return false;
        }
        return true;
    }

    /**
     * Returns the eight corners of the frustum.
     */
    private getFrustumCorners(): THREE.Vector3[] {
        const frustumCorners = this.m_frustumCorners;
        const invProjMatrix = (this.m_camera as any).projectionMatrixInverse as THREE.Matrix4;

        let cornerIndex = 0;

        function addPoint(x: number, y: number, z: number) {
            frustumCorners[cornerIndex++].set(x, y, z).applyMatrix4(invProjMatrix);
        }

        const w = 1;
        const h = 1;
        const n = -1;
        const f = 1;

        // near
        addPoint(-w, -h, n);
        addPoint(w, -h, n);
        addPoint(-w, h, n);
        addPoint(w, h, n);

        // far
        addPoint(-w, -h, f);
        addPoint(w, -h, f);
        addPoint(-w, h, f);
        addPoint(w, h, f);

        return frustumCorners;
    }
}
