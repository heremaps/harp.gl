/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { HighPrecisionLineMaterial } from "@here/harp-materials";
import * as THREE from "three";

import { HighPrecisionUtils } from "./HighPrecisionUtils";

/**
 * Declare interface for `HighPrecisionObject` which describes additional functionality to render
 * high-precision vertices.
 */
export interface HighPrecisionObject extends THREE.Object3D {
    /**
     * Allow direct access to [[BufferGeometry]] without cast.
     */
    bufferGeometry: THREE.BufferGeometry;

    /**
     * Allow direct access to [[ShaderMaterial]] without cast.
     */
    shaderMaterial: THREE.ShaderMaterial;

    /**
     * Inversed World Matrix.
     */
    matrixWorldInverse: THREE.Matrix4;

    /**
     * Sets up attributes for position (one attribute for major 32 bits position "halve", and one
     * attribute for lower 32 bits).
     */
    setPositions(positions: number[] | THREE.Vector3[]): void;

    /**
     * Prepare the objects "`onBeforeRender()`" callback to generate proper high-precision camera
     * position.
     */
    setupForRendering(): void;
}

/**
 * Class used to render high-precision wireframe lines.
 */
export class HighPrecisionWireFrameLine extends THREE.Line implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;

    /**
     * Creates a `HighPrecisionWireFrameLine` object.
     *
     * @param geometry - [[BufferGeometry]] used to render this object.
     * @param material - [[HighPrecisionLineMaterial]] used to render this object.
     * @param positions - Array of 2D/3D positions.
     */
    constructor(
        geometry: THREE.BufferGeometry,
        material: HighPrecisionLineMaterial,
        positions?: number[] | THREE.Vector3[]
    ) {
        super(geometry, material);
        this.matrixWorldInverse = new THREE.Matrix4();

        if (positions) {
            this.setPositions(positions);
        }
    }

    get bufferGeometry(): THREE.BufferGeometry {
        return this.geometry as THREE.BufferGeometry;
    }

    get shaderMaterial(): THREE.ShaderMaterial {
        return this.material as THREE.ShaderMaterial;
    }

    setPositions(positions: number[] | THREE.Vector3[]): void {
        HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {
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

/**
 * Class used to render high-precision lines.
 */
export class HighPrecisionLine extends THREE.Mesh implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;

    /**
     * Creates a `HighPrecisionLine` object.
     *
     * @param geometry - [[BufferGeometry]] used to render this object.
     * @param material - [[HighPrecisionLineMaterial]] used to render this object.
     * @param positions - Array of 2D/3D positions.
     */
    constructor(
        geometry: THREE.BufferGeometry,
        material: HighPrecisionLineMaterial,
        positions?: number[] | THREE.Vector3[]
    ) {
        super(geometry, material);

        this.matrixWorldInverse = new THREE.Matrix4();

        if (positions) {
            this.setPositions(positions);
        }
    }

    get bufferGeometry(): THREE.BufferGeometry {
        return this.geometry as THREE.BufferGeometry;
    }

    get shaderMaterial(): THREE.ShaderMaterial {
        return this.material as THREE.ShaderMaterial;
    }

    setPositions(positions: number[] | THREE.Vector3[]): void {
        HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {
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
