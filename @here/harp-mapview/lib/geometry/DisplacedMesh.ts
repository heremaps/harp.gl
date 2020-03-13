/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { hasDisplacementFeature } from "@here/harp-materials";
import * as THREE from "three";
import { DisplacedBufferAttribute } from "./DisplacedBufferAttribute";
import { DisplacedBufferGeometry, DisplacementRange } from "./DisplacedBufferGeometry";

/**
 * Mesh with geometry modified by a displacement map. Overrides raycasting behaviour to apply
 * displacement map before intersection test.
 * @internal
 */
export class DisplacedMesh extends THREE.Mesh {
    private static displacedPositions?: DisplacedBufferAttribute;

    private static getDisplacedPositionAttribute(
        geometry: THREE.BufferGeometry,
        displacementMap: THREE.DataTexture
    ): DisplacedBufferAttribute {
        // Reuse same buffer attribute for all meshes since it's only needed during the
        // intersection test.
        if (!DisplacedMesh.displacedPositions) {
            DisplacedMesh.displacedPositions = new DisplacedBufferAttribute(
                geometry.attributes.position,
                geometry.attributes.normal,
                geometry.attributes.uv,
                displacementMap
            );
        } else {
            DisplacedMesh.displacedPositions.reset(
                geometry.attributes.position,
                geometry.attributes.normal,
                geometry.attributes.uv,
                displacementMap
            );
        }
        return DisplacedMesh.displacedPositions;
    }

    m_displacedGeometry?: DisplacedBufferGeometry;

    /**
     * Creates an instance of displaced mesh.
     * @param m_getDisplacementRange Displacement values range getter.
     * @param [geometry] Original geometry to displace.
     * @param [material] Material(s) to be used by the mesh. All must have the same displacement
     * map.
     */
    constructor(
        private m_getDisplacementRange: () => DisplacementRange,
        geometry?: THREE.Geometry | THREE.BufferGeometry,
        material?: THREE.Material | THREE.Material[]
    ) {
        super(geometry, material);
    }

    /** @override */
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        // All materials in the object are expected to have the same displacement map.
        const material: THREE.Material = Array.isArray(this.material)
            ? this.material[0]
            : this.material;

        // Use default raycasting implementation if some type is unexpected.
        if (
            !(this.geometry instanceof THREE.BufferGeometry) ||
            !hasDisplacementFeature(material) ||
            !(material.displacementMap instanceof THREE.DataTexture)
        ) {
            super.raycast(raycaster, intersects);
            return;
        }
        const displacementMap = material.displacementMap;
        const displacementRange = this.m_getDisplacementRange();

        if (this.m_displacedGeometry) {
            this.m_displacedGeometry.reset(this.geometry, displacementMap, displacementRange);
        } else {
            this.m_displacedGeometry = new DisplacedBufferGeometry(
                this.geometry,
                displacementMap,
                displacementRange,
                DisplacedMesh.getDisplacedPositionAttribute(this.geometry, displacementMap)
            );
        }

        // Replace the original geometry by the displaced one only during the intersection test.
        this.geometry = this.m_displacedGeometry;
        super.raycast(raycaster, intersects);
        this.geometry = this.m_displacedGeometry.originalGeometry;
    }
}
