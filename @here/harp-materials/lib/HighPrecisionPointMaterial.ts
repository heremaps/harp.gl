/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import linesShaderChunk from "./ShaderChunks/LinesChunks";

const vertexSource: string = `
#ifdef USE_COLOR
varying vec3 vColor;
#endif

uniform float size;

// uniforms to implement double-precision
uniform mat4 u_mvp;             // combined modelView and projection matrix
uniform vec3 u_eyepos;          // eye position major
uniform vec3 u_eyepos_lowpart;  // eye position minor ((double) eyepos - (float) eyepos)

// vertex attributes
attribute vec3 positionLow;     // low part

#include <high_precision_vert_func>

void main() {
    #ifdef USE_COLOR
    vColor = color.rgb;
    #endif

    vec3 pos = subtractDblEyePos(position);
    gl_Position = u_mvp * vec4(pos, 1.0);

    // ignore sizeAttenuation for now!
    gl_PointSize = size;
}`;

/**
 * Parameters used when constructing a new {@link HighPrecisionPointMaterial}.
 */
export interface HighPrecisionPointMaterialParameters extends THREE.PointsMaterialParameters {
    /**
     * Point color.
     */
    color?: number | string | THREE.Color;
    /**
     * Point opacity.
     */
    opacity?: number;
    /**
     * Point scale.
     */
    scale?: number;
    /**
     * UV transformation matrix.
     */
    uvTransform?: THREE.Matrix3;
}

/**
 * Material designed to render high precision points (ideal for position-sensible data).
 */
export class HighPrecisionPointMaterial extends THREE.PointsMaterial {
    static DEFAULT_COLOR: number = 0x000050;
    static DEFAULT_OPACITY: number = 1.0;
    static DEFAULT_SIZE: number = 1.0;
    static DEFAULT_SCALE: number = 1.0;

    isHighPrecisionPointMaterial: boolean;
    uniforms: { [uniform: string]: THREE.IUniform };
    vertexShader?: string;
    fragmentShader?: string;

    /**
     * Constructs a new `HighPrecisionPointMaterial`.
     *
     * @param params - `HighPrecisionPointMaterial` parameters.
     */
    constructor(params?: HighPrecisionPointMaterialParameters) {
        Object.assign(THREE.ShaderChunk, linesShaderChunk);

        const shaderParams = params;
        super(shaderParams);

        this.type = "HighPrecisionPointMaterial";
        this.vertexShader = vertexSource;
        this.fragmentShader = THREE.ShaderChunk.points_frag;
        this.fog = false;

        this.uniforms = {
            diffuse: new THREE.Uniform(new THREE.Color(HighPrecisionPointMaterial.DEFAULT_COLOR)),
            opacity: new THREE.Uniform(HighPrecisionPointMaterial.DEFAULT_OPACITY),
            size: new THREE.Uniform(HighPrecisionPointMaterial.DEFAULT_SIZE),
            scale: new THREE.Uniform(HighPrecisionPointMaterial.DEFAULT_SCALE),
            map: new THREE.Uniform(new THREE.Texture()),
            uvTransform: new THREE.Uniform(new THREE.Matrix3()),
            u_mvp: new THREE.Uniform(new THREE.Matrix4()),
            u_eyepos: new THREE.Uniform(new THREE.Vector3()),
            u_eyepos_lowpart: new THREE.Uniform(new THREE.Vector3())
        };

        this.isHighPrecisionPointMaterial = true;

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.color !== undefined) {
                this.color.set(params.color as any);
            }
            if (params.opacity !== undefined) {
                this.opacity = params.opacity;
            }
            if (params.size !== undefined) {
                this.size = params.size;
            }
            if (params.scale !== undefined) {
                this.scale = params.scale;
            }
            if (params.uvTransform !== undefined) {
                this.uvTransform = params.uvTransform;
            }
            if (params.map !== undefined) {
                this.map = params.map;
            }
        }
    }

    /**
     *  Point scale.
     */
    get scale(): number {
        return this.uniforms.scale.value;
    }

    set scale(value: number) {
        this.uniforms.scale.value = value;
    }

    /**
     * UV transformation matrix.
     */
    get uvTransform(): THREE.Matrix3 {
        return this.uniforms.uvTransform.value;
    }

    set uvTransform(value: THREE.Matrix3) {
        this.uniforms.uvTransform.value = value;
    }
}

export function isHighPrecisionPointMaterial(
    material: object | undefined
): material is HighPrecisionPointMaterial {
    return (
        material !== undefined &&
        (material as HighPrecisionPointMaterial).isHighPrecisionPointMaterial === true
    );
}
