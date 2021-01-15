/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { DisplacedBufferAttribute } from "./DisplacedBufferAttribute";

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpBox = new THREE.Box3();

/**
 * @internal
 * Range of displacement values found in a given displacement map.
 */
export interface DisplacementRange {
    min: number;
    max: number;
}

/**
 * @internal
 * Displace a box in a given direction by a specified range. The original box min and max vertices
 * are translated as a result by displacementRange.min and displacementRange.max respectively.
 * @param box - The original box to displace.
 * @param displacementRange - The minimum and maximum displacement values.
 * @param displacementDir - Direction in which the displacement will be applied.
 * @return The displaced box.
 */
export function displaceBox(
    box: THREE.Box3,
    displacementRange: DisplacementRange,
    displacementDir: THREE.Vector3
): THREE.Box3 {
    tmpBox.copy(box);
    const tmpNormalMin = tmpV1.copy(displacementDir);
    const tmpNormalMax = tmpV2.copy(tmpNormalMin);
    box.translate(tmpNormalMin.multiplyScalar(displacementRange.min)).union(
        tmpBox.translate(tmpNormalMax.multiplyScalar(displacementRange.max))
    );
    return box;
}

/**
 * @internal
 * BufferGeometry decorator that displaces on the fly the position attribute using a specified
 * displacement map.
 */
export class DisplacedBufferGeometry extends THREE.BufferGeometry {
    private readonly m_displacedPositions: DisplacedBufferAttribute;
    private readonly m_originalBoundingBox = new THREE.Box3();

    /**
     * Creates an instance of displaced buffer geometry.
     * @param originalGeometry - The goeometry to be displaced.
     * @param displacementMap - A texture with the displacement values.
     * @param displacementRange - The displacement value range found in the displacement map.
     * @param displacedPositions - Buffer attribute that will be used for displaced positions if
     * provided, otherwise a new buffer attribute will be created.
     */
    constructor(
        public originalGeometry: THREE.BufferGeometry,
        displacementMap: THREE.DataTexture,
        public displacementRange: DisplacementRange,
        displacedPositions?: DisplacedBufferAttribute
    ) {
        super();
        if (!displacedPositions) {
            this.m_displacedPositions = new DisplacedBufferAttribute(
                originalGeometry.attributes.position,
                originalGeometry.attributes.normal,
                originalGeometry.attributes.uv,
                displacementMap
            );
        } else {
            this.m_displacedPositions = displacedPositions;
        }
        this.resetAttributes();
    }

    /**
     * Resets the displaced buffer geometry to use new geometry or displacement map.
     * @param geometry - The goeometry to be displaced.
     * @param displacementMap - A texture with the displacement values.
     * @param displacementRange - The displacement value range found in the displacement map.
     */
    reset(
        geometry: THREE.BufferGeometry,
        displacementMap: THREE.DataTexture,
        displacementRange: DisplacementRange
    ) {
        this.originalGeometry = geometry;
        const positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;
        const uvs = geometry.attributes.uv;
        this.m_displacedPositions.reset(positions, normals, uvs, displacementMap);
        const displacementRangeChanged =
            this.displacementRange.min !== displacementRange.min ||
            this.displacementRange.max !== displacementRange.max;
        this.displacementRange = displacementRange;
        this.resetAttributes();
        this.resetBoundingVolumes(displacementRangeChanged);
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    computeBoundingBox(): void {
        // Calculate a coarse approximation of the displaced geometry bbox by displacing the
        // original bbox and enlarging it to cover the whole displacement range.
        // This approximation is used to avoid having to displace the whole geometry, which will
        // be done only if the bbox test passes.
        if (this.originalGeometry.boundingBox === null) {
            this.originalGeometry.computeBoundingBox();
        }
        const origBBox = this.m_originalBoundingBox.copy(this.originalGeometry.boundingBox!);
        if (this.boundingBox === null) {
            this.boundingBox = origBBox.clone();
        } else {
            this.boundingBox.copy(origBBox);
        }
        displaceBox(
            this.boundingBox,
            this.displacementRange,
            tmpV1.fromBufferAttribute(this.attributes.normal as THREE.BufferAttribute, 0)
        );
    }

    // HARP-9585: Override of base class method, however tslint doesn't recognize it as such.
    computeBoundingSphere(): void {
        // Use as coarse approximation the sphere bounding the bbox.
        if (this.boundingBox === null) {
            this.computeBoundingBox();
        }
        if (this.boundingSphere === null) {
            this.boundingSphere = new THREE.Sphere();
        }
        this.boundingBox!.getBoundingSphere(this.boundingSphere!);
    }

    private needsBoundingBoxUpdate(displacementRangeChanged: boolean): boolean {
        return (
            displacementRangeChanged ||
            (this.boundingBox !== null &&
                (!this.originalGeometry.boundingBox ||
                    !this.m_originalBoundingBox.equals(this.originalGeometry.boundingBox)))
        );
    }

    private resetBoundingVolumes(displacementRangeChanged: boolean) {
        if (this.needsBoundingBoxUpdate(displacementRangeChanged)) {
            this.computeBoundingBox();
            if (this.boundingSphere) {
                this.computeBoundingSphere();
            }
        }
    }

    private resetAttributes() {
        this.index = this.originalGeometry.index;
        this.groups = this.originalGeometry.groups;
        this.drawRange = this.originalGeometry.drawRange;
        this.attributes = { ...this.originalGeometry.attributes };
        this.attributes.position = this.m_displacedPositions;
    }
}
