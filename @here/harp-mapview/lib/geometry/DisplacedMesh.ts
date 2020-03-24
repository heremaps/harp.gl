/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DisplacementFeature, hasDisplacementFeature } from "@here/harp-materials";
import { assert } from "@here/harp-utils";
import * as THREE from "three";
import { DisplacedBufferAttribute } from "./DisplacedBufferAttribute";
import { DisplacedBufferGeometry, DisplacementRange } from "./DisplacedBufferGeometry";

function isDisplacementMaterial(material: any): material is DisplacementFeature {
    const isDisplacementFeature = hasDisplacementFeature(material);
    assert(isDisplacementFeature, "Material does not support displacement maps.");
    return isDisplacementFeature;
}

function isDataTextureMap(map?: THREE.Texture | null): map is THREE.DataTexture {
    if (!map) {
        return false;
    }
    const isDataTexture = map instanceof THREE.DataTexture;
    assert(isDataTexture, "Material does not support displacement maps.");
    return isDataTexture;
}

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
    private m_displacementMaterial?: DisplacementFeature;

    /**
     * Creates an instance of displaced mesh.
     * @param geometry Original geometry to displace.
     * @param material Material(s) to be used by the mesh. All must have the same displacement map.
     * @param m_getDisplacementRange Displacement values range getter.
     * @param [m_raycastStrategy] Function that will be used to find ray intersections. If not
     * provided, THREE.Mesh's raycast will be used.
     */
    constructor(
        geometry: THREE.BufferGeometry,
        material: THREE.Material | THREE.Material[],
        private m_getDisplacementRange: () => DisplacementRange,
        private m_raycastStrategy?: (
            mesh: THREE.Mesh,
            raycaster: THREE.Raycaster,
            intersects: THREE.Intersection[]
        ) => void
    ) {
        super(geometry, material);
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    get geometry(): THREE.BufferGeometry {
        return super.geometry as THREE.BufferGeometry;
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    set geometry(geometry: THREE.BufferGeometry) {
        super.geometry = geometry;
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    get material(): THREE.Material | THREE.Material[] {
        return super.material;
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    set material(material: THREE.Material | THREE.Material[]) {
        super.material = material;
        const firstMaterial = this.firstMaterial;
        if (isDisplacementMaterial(firstMaterial)) {
            this.m_displacementMaterial = firstMaterial;
        }
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    // tslint:disable-next-line: explicit-override
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        // All materials in the object are expected to have the same displacement map.
        const displacementMap = this.m_displacementMaterial!.displacementMap;

        // Use default raycasting implementation if there's no displacement map or its type is not
        // supported.
        if (!isDataTextureMap(displacementMap)) {
            super.raycast(raycaster, intersects);
            return;
        }
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
        if (this.m_raycastStrategy) {
            this.m_raycastStrategy(this, raycaster, intersects);
        } else {
            super.raycast(raycaster, intersects);
        }
        super.geometry = this.m_displacedGeometry.originalGeometry;
    }

    private get firstMaterial(): THREE.Material {
        return Array.isArray(this.material) ? this.material[0] : this.material;
    }
}
