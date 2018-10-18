/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { HighPrecisionLineMaterial } from "@here/materials";

import * as THREE from "three";
import { HighPrecisionUtils } from "./HighPrecisionUtils";

/**
 * Declare interface for `HighPrecisionLineMaterial` which describes additional functionality to
 * render high-precision vertices.
 */
export interface HighPrecisionLineMaterial extends THREE.RawShaderMaterial {
    isHighPrecisionLineMaterial: boolean;

    setDimensionality(dimensionality: number): void;
}

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
    setPositions(positions: number[] | THREE.Vector2[] | THREE.Vector3[]): void;

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
     * Number of dimensions this `HighPrecisionObject` is specified in (2D/3D).
     */
    dimensionality: number = 0;

    /**
     * Creates a `HighPrecisionWireFrameLine` object.
     *
     * @param geometry [[BufferGeometry]] used to render this object.
     * @param material [[HighPrecisionLineMaterial]] used to render this object.
     *     instances.
     * @param positions Array of 2D/3D positions.
     * @param color Color of the rendered line.
     * @param opacity Opacity of the rendered line.
     */
    constructor(
        geometry?: THREE.BufferGeometry,
        material?: HighPrecisionLineMaterial,
        positions?: number[] | THREE.Vector2[] | THREE.Vector3[],
        color?: THREE.Color,
        opacity?: number
    ) {
        super(geometry === undefined ? new THREE.BufferGeometry() : geometry, material);

        if (material === undefined) {
            material = new HighPrecisionLineMaterial({
                color: color ? color : HighPrecisionLineMaterial.DEFAULT_COLOR,
                opacity: opacity !== undefined ? opacity : HighPrecisionLineMaterial.DEFAULT_OPACITY
            });
        }

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

    setPositions(positions: number[] | THREE.Vector2[] | THREE.Vector3[]): void {
        this.dimensionality = HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {
        if (this.dimensionality === 0 || this.dimensionality === undefined) {
            throw new Error("HighPrecisionLine: positions not specified.");
        }
        if ((this.material as any).isHighPrecisionLineMaterial) {
            (this.material as any).setDimensionality(this.dimensionality);
        }

        this.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.Geometry | THREE.BufferGeometry,
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
            this.matrixWorldInverse.getInverse(this.matrixWorld);
        }
    }
}

/**
 * Class used to render high-precision lines.
 */
export class HighPrecisionLine extends THREE.Mesh implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;

    /**
     * Number of dimensions this `HighPrecisionObject` is specified in (2D/3D).
     */
    dimensionality: number = 0;

    /**
     * Creates a `HighPrecisionLine` object.
     *
     * @param geometry [[BufferGeometry]] used to render this object.
     * @param material [[HighPrecisionLineMaterial]] used to render this object.
     *     instances.
     * @param positions Array of 2D/3D positions.
     * @param color Color of the rendered line.
     * @param opacity Opacity of the rendered line.
     */
    constructor(
        geometry?: THREE.BufferGeometry,
        material?: HighPrecisionLineMaterial,
        positions?: number[] | THREE.Vector2[] | THREE.Vector3[],
        color?: THREE.Color,
        opacity?: number
    ) {
        super(geometry === undefined ? new THREE.BufferGeometry() : geometry, material);

        if (material === undefined) {
            material = new HighPrecisionLineMaterial({
                color: color ? color : HighPrecisionLineMaterial.DEFAULT_COLOR,
                opacity: opacity !== undefined ? opacity : HighPrecisionLineMaterial.DEFAULT_OPACITY
            });
        }

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

    setPositions(
        positions: number[] | THREE.Vector2[] | THREE.Vector3[],
        dimensionality?: number
    ): void {
        this.dimensionality = HighPrecisionUtils.setPositions(this, positions, dimensionality);
    }

    setupForRendering(): void {
        if ((this.material as any).isHighPrecisionLineMaterial) {
            (this.material as any).setDimensionality(this.dimensionality);
        }

        this.onBeforeRender = (
            _renderer: THREE.WebGLRenderer,
            _scene: THREE.Scene,
            camera: THREE.Camera,
            _geometry: THREE.Geometry | THREE.BufferGeometry,
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
            this.matrixWorldInverse.getInverse(this.matrixWorld);
        }
    }
}
