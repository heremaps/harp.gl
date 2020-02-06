/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MathUtils } from "@here/harp-geoutils";
import * as THREE from "three";

/**
 * A mesh that can store multiple versions of a geometry with differents level of detail.
 * The rendered level of detail can be adapted during runtime.
 * @internal
 * @hidden
 */
export class LodMesh extends THREE.Mesh {
    private m_geometries: Array<THREE.Geometry | THREE.BufferGeometry> | undefined;

    /**
     * Creates a [[LodMesh]] with given geometries and materials
     * @param geometries A list of geometries with different levels of detail
     * @param material Material for the mesh
     */
    constructor(
        geometries?: Array<THREE.Geometry | THREE.BufferGeometry>,
        material?: THREE.Material | THREE.Material[] | undefined
    ) {
        super(undefined, material);

        this.geometries = geometries;
    }

    /**
     * Update geometries of mesh
     */
    set geometries(geometries: Array<THREE.Geometry | THREE.BufferGeometry> | undefined) {
        this.m_geometries = geometries;
        this.geometry =
            this.geometries && this.m_geometries!.length > 0
                ? this.m_geometries![0]
                : new THREE.BufferGeometry();
    }

    /**
     * Get geometries of mesh
     */
    get geometries() {
        return this.m_geometries;
    }

    /**
     * Change the rendered level of detail of the mesh
     * @param level The level of detail (index of the geometry in the list).
     */
    setLevelOfDetail(level: number): void {
        if (!this.m_geometries || this.m_geometries.length === 0) {
            return;
        }
        level = MathUtils.clamp(level, 0, this.m_geometries.length - 1);

        this.geometry = this.m_geometries[level];
    }
}
