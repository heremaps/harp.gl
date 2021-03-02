/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { HighPrecisionPointMaterial } from "@here/harp-materials";
import * as THREE from "three";

import { HighPrecisionObject } from "./HighPrecisionLines";
import { HighPrecisionUtils } from "./HighPrecisionUtils";

/**
 * Class used to render high-precision points.
 */
export class HighPrecisionPoints extends THREE.Points implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;

    /**
     * Number of dimensions this `HighPrecisionObject` is specified in (2D/3D).
     */
    dimensionality?: number;

    /**
     * Creates a `HighPrecisionPoints` object.
     *
     * @param geometry - [[BufferGeometry]] used to render this object.
     * @param material - [[HighPrecisionLineMaterial]] used to render this object.
     *     instances.
     * @param positions - Array of 2D/3D positions.
     * @param color - Color of the rendered point.
     * @param opacity - Opacity of the rendered point.
     */
    constructor(
        geometry?: THREE.BufferGeometry,
        material?: HighPrecisionPointMaterial,
        positions?: number[] | THREE.Vector3[],
        color?: THREE.Color,
        opacity?: number
    ) {
        if (material === undefined) {
            material = new HighPrecisionPointMaterial({
                color: color ? color : HighPrecisionPointMaterial.DEFAULT_COLOR,
                opacity: opacity !== undefined ? opacity : 1
            });
        }

        super(geometry === undefined ? new THREE.BufferGeometry() : geometry, material);

        this.matrixWorldInverse = new THREE.Matrix4();

        if (positions) {
            this.setPositions(positions);
        }
    }

    get bufferGeometry(): THREE.BufferGeometry {
        return this.geometry as THREE.BufferGeometry;
    }

    /**
     * Clears the [[BufferGeometry]] used to render this point.
     */
    clearGeometry(): THREE.BufferGeometry {
        return (this.geometry = new THREE.BufferGeometry());
    }

    get shaderMaterial(): THREE.ShaderMaterial {
        return this.material as THREE.ShaderMaterial;
    }

    setPositions(positions: number[] | THREE.Vector3[]): void {
        HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {
        if (
            (this.material as any).isHighPrecisionPointsMaterial &&
            this.dimensionality !== undefined
        ) {
            (this.material as any).setDimensionality(this.dimensionality);
        }
        this.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.BufferGeometry,
            _material: THREE.Material,
            _group: THREE.Group
        ) => {
            HighPrecisionUtils.updateHpUniforms(this, camera, this.shaderMaterial);
        };
    }

    updateMatrixWorld(force: boolean) {
        const doUpdateMatrixWorldInverse = this.matrixWorldNeedsUpdate || force;

        super.updateMatrixWorld(force);

        if (doUpdateMatrixWorldInverse) {
            this.matrixWorldInverse.copy(this.matrixWorld).invert();
        }
    }
}
