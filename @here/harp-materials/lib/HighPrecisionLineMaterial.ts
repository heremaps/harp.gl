/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import linesShaderChunk from "./ShaderChunks/LinesChunks";

const vertexSource2D: string = `
#ifdef USE_COLOR
attribute vec4 color;
varying vec3 vColor;
#endif

// uniforms to implement double-precision
uniform mat4 u_mvp;             // combined modelView and projection matrix
uniform vec3 u_eyepos;          // eye position major
uniform vec3 u_eyepos_lowpart;  // eye position minor ((double) eyepos - (float) eyepos)

// vertex attributes
attribute vec2 position;        // high part
attribute vec2 positionLow;     // low part

#include <high_precision_vert2D_func>

void main() {
    #ifdef USE_COLOR
    vColor = color.rgb;
    #endif

    vec2 pos = subtractDblEyePos(position);
    gl_Position = u_mvp * vec4(pos, 0.0, 1.0);
}`;

const vertexSource3D: string = `
#ifdef USE_COLOR
attribute vec4 color;
varying vec3 vColor;
#endif

// uniforms to implement double-precision
uniform mat4 u_mvp;             // combined modelView and projection matrix
uniform vec3 u_eyepos;          // eye position major
uniform vec3 u_eyepos_lowpart;  // eye position minor ((double) eyepos - (float) eyepos)

// vertex attributes
attribute vec3 position;        // high part
attribute vec3 positionLow;     // low part

#include <high_precision_vert3D_func>

void main() {
    #ifdef USE_COLOR
    vColor = color.rgb;
    #endif

    vec3 pos = subtractDblEyePos(position);
    gl_Position = u_mvp * vec4(pos, 1.0);
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

uniform vec3 diffuse;
uniform float opacity;

#ifdef USE_COLOR
varying vec3 color;
#endif

void main() {
    #ifdef USE_COLOR
    gl_FragColor = vec4( diffuse * vColor, opacity );
    #else
    gl_FragColor = vec4( diffuse, opacity );
    #endif
}`;

/**
 * Parameters used when constructing a new [[SolidLineMaterial]].
 */
export interface HighPrecisionLineMaterialParameters {
    /**
     * Line color.
     */
    color?: number | string | THREE.Color;
    /**
     * Line opacity.
     */
    opacity?: number;
}

/**
 * Material designed to render high precision lines (ideal for position-sensible data).
 */
export class HighPrecisionLineMaterial extends THREE.RawShaderMaterial {
    static DEFAULT_COLOR: number = 0x000050;
    static DEFAULT_OPACITY: number = 1.0;

    isHighPrecisionLineMaterial: boolean;
    dimensionality: number;

    /**
     * Constructs a new `HighPrecisionLineMaterial`.
     *
     * @param params `HighPrecisionLineMaterial` parameters.
     */
    constructor(params?: HighPrecisionLineMaterialParameters) {
        Object.assign(THREE.ShaderChunk, linesShaderChunk);

        const shaderParams = {
            name: "HighPrecisionLineMaterial",
            vertexShader: vertexSource3D,
            fragmentShader: fragmentSource,
            uniforms: {
                diffuse: new THREE.Uniform(
                    new THREE.Color(HighPrecisionLineMaterial.DEFAULT_COLOR)
                ),
                opacity: new THREE.Uniform(HighPrecisionLineMaterial.DEFAULT_OPACITY),
                u_mvp: new THREE.Uniform(new THREE.Matrix4()),
                u_eyepos: new THREE.Uniform(new THREE.Vector3()),
                u_eyepos_lowpart: new THREE.Uniform(new THREE.Vector3())
            }
        };
        Object.assign(shaderParams, params);
        super(shaderParams);

        this.type = "HighPrecisionLineMaterial";
        this.isHighPrecisionLineMaterial = true;
        this.dimensionality = 2;

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.color !== undefined) {
                this.color.set(params.color as any);
            }
            if (params.opacity !== undefined) {
                this.opacity = params.opacity;
            }
        }

        this.updateTransparencyFeature();
    }

    /**
     * Line color.
     */
    get color(): THREE.Color {
        return this.uniforms.diffuse.value as THREE.Color;
    }
    set color(value: THREE.Color) {
        this.uniforms.diffuse.value = value;
    }

    /**
     * Sets the number of dimensions this material is intended to work for (2D/3D).
     * @param dimensionality Number of dimensions (`2` = 2D, `3` = 3D).
     */
    setDimensionality(dimensionality: number): void {
        if (dimensionality !== this.dimensionality) {
            this.dimensionality = dimensionality;
            this.vertexShader = this.dimensionality === 2 ? vertexSource2D : vertexSource3D;
        }
    }

    private updateTransparencyFeature() {
        this.transparent = this.opacity < 1.0 ? true : false;
    }
}
