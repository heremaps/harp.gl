/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

const vertexSource: string = `
attribute vec3 position;
attribute vec4 color;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 edgeColor;
uniform float edgeColorMix;

varying vec3 vColor;
#if DEPTH_FADE_OUT
varying float vDepth;
#endif

void main() {
    #if USE_COLOR
    vColor = mix(edgeColor.rgb, color.rgb, edgeColorMix);
    #else
    vColor = edgeColor.rgb;
    #endif

    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    #if DEPTH_FADE_OUT
    vDepth = gl_Position.z/gl_Position.w;
    #endif
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

varying vec3 vColor;
#if DEPTH_FADE_OUT
varying float vDepth;
uniform float depthFadeDist;
#endif

void main() {
    float alphaValue = 1.0;
    #if DEPTH_FADE_OUT
    alphaValue = (1.0 - vDepth) * (1.0 / (1.0 - depthFadeDist));
    #endif

    gl_FragColor = vec4(vColor, alphaValue);
}`;

/**
 * Parameters used when constructing a new [[EdgeMaterial]].
 */
export interface EdgeMaterialParameters {
    /**
     * Edge color.
     */
    color?: number | string;
    /**
     * Color mix value. Mixes between vertexColors and edgeColor.
     */
    colorMix?: number;
    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which edges start fading out.
     */
    fadeDistance?: number;
}

/**
 * Material designed to render the edges of extruded buildings using GL_LINES. It supports solid
 * colors, vertex colors, color mixing and distance fading.
 */
export class EdgeMaterial extends THREE.RawShaderMaterial {
    static DEFAULT_COLOR: number = 0x000000;
    static DEFAULT_COLOR_MIX: number = 0.0;
    static DEFAULT_FADE_DIST: number = 0.9;

    /**
     * Constructs a new `EdgeMaterial`.
     *
     * @param params `EdgeMaterial` parameters.
     */
    constructor(params?: EdgeMaterialParameters) {
        const shaderParams = {
            name: "EdgeMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
            uniforms: {
                edgeColor: new THREE.Uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR)),
                edgeColorMix: new THREE.Uniform(EdgeMaterial.DEFAULT_COLOR_MIX),
                depthFadeDist: new THREE.Uniform(EdgeMaterial.DEFAULT_FADE_DIST)
            },
            depthWrite: false
        };
        super(shaderParams);

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.color !== undefined) {
                this.color.set(params.color as any);
            }
            if (params.colorMix !== undefined) {
                this.colorMix = params.colorMix;
            }
            if (params.fadeDistance !== undefined) {
                this.fadeDistance = params.fadeDistance;
            }
        }
    }

    /**
     * Edge color.
     */
    get color(): THREE.Color {
        return this.uniforms.edgeColor.value as THREE.Color;
    }
    set color(value: THREE.Color) {
        this.uniforms.edgeColor.value = value;
    }

    /**
     * Color mix value. Mixes between vertexColors and edgeColor.
     */
    get colorMix(): number {
        return this.uniforms.edgeColorMix.value as number;
    }
    set colorMix(value: number) {
        this.uniforms.edgeColorMix.value = value;
        this.updateColorMixFeature();
    }

    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which edges start fading out.
     */
    get fadeDistance(): number {
        return this.uniforms.depthFadeDist.value as number;
    }
    set fadeDistance(value: number) {
        this.uniforms.depthFadeDist.value = value;
        this.updateDistanceFadeFeature();
    }

    private updateColorMixFeature(): void {
        this.defines.USE_COLOR = this.colorMix > 0.0 ? 1 : 0;
    }

    private updateDistanceFadeFeature(): void {
        if (this.fadeDistance < 1.0) {
            this.transparent = true;
            this.defines.DEPTH_FADE_OUT = 1;
        } else {
            this.transparent = false;
            this.defines.DEPTH_FADE_OUT = 0;
        }
    }
}
