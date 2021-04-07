/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * A mesh that can store multiple versions of a geometry with differents level of detail.
 * The rendered level of detail can be adapted during runtime.
 * @internal
 * @hidden
 */
export class LodMesh extends THREE.Mesh {
    private m_geometries: THREE.BufferGeometry[] | undefined;

    /**
     * Creates a [[LodMesh]] with given geometries and materials
     * @param geometries - A list of geometries with different levels of detail
     * @param material - Material for the mesh
     */
    constructor(
        geometries?: THREE.BufferGeometry[],
        material?: THREE.Material | THREE.Material[] | undefined
    ) {
        super(undefined, material);

        this.geometries = geometries;
    }

    /**
     * Update geometries of mesh
     */
    set geometries(geometries: THREE.BufferGeometry[] | undefined) {
        // dispose previous geometries
        if (this.m_geometries !== geometries) {
            this.disposeGeometries();
        }

        this.m_geometries = geometries;
        if (this.geometries && this.m_geometries!.length > 0) {
            this.geometry = this.m_geometries![0];
        }
    }

    /**
     * Get geometries of mesh
     */
    get geometries() {
        return this.m_geometries;
    }

    /**
     * Change the rendered level of detail of the mesh
     * @param level - The level of detail (index of the geometry in the list).
     */
    setLevelOfDetail(level: number): void {
        if (!this.m_geometries || this.m_geometries.length === 0) {
            return;
        }
        level = THREE.MathUtils.clamp(level, 0, this.m_geometries.length - 1);

        this.geometry = this.m_geometries[level];
    }

    /**
     * Dispose all geometries of mesh
     */
    private disposeGeometries(): void {
        if (this.m_geometries) {
            for (const geometry of this.m_geometries!) {
                geometry.dispose();
            }
        }
        this.geometry.dispose();
    }
}
