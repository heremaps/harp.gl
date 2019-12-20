/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    DisplacementFeature,
    DisplacementFeatureParameters,
    ExtrusionFeature,
    FadingFeature,
    FadingFeatureParameters
} from "./MapMeshMaterials";
import { enforceBlending } from "./Utils";

const vertexSource: string = `
#define EDGE_DEPTH_OFFSET 0.0001

attribute vec3 position;
attribute vec4 color;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform vec3 edgeColor;
uniform float edgeColorMix;

#ifdef USE_DISPLACEMENTMAP
attribute vec3 normal;
attribute vec2 uv;
uniform sampler2D displacementMap;
#endif

varying vec3 vColor;

#ifdef USE_EXTRUSION
#include <extrusion_pars_vertex>
#endif

#ifdef USE_FADING
#include <fading_pars_vertex>
#endif

void main() {

    #ifdef USE_COLOR
    vColor = mix(edgeColor.rgb, color.rgb, edgeColorMix);
    #else
    vColor = edgeColor.rgb;
    #endif

    vec3 transformed = vec3( position );

    #ifdef USE_EXTRUSION
    #include <extrusion_vertex>
    #endif

    #ifdef USE_DISPLACEMENTMAP
    transformed += normalize( normal ) * texture2D( displacementMap, uv ).x;
    #endif

    vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );

    gl_Position = projectionMatrix * mvPosition;
    // After projection gl_Position contains clip space coordinates of each vertex
    // before perspective division (1 / w), thus only vertexes with -w < z < w should
    // be displayed and offset. We offset only those edges which z coordinate in NDC
    // space is between: -inf < z < 1
    float depthOffset = step(-1.0, -gl_Position.z / gl_Position.w) * EDGE_DEPTH_OFFSET;
    gl_Position.z -= depthOffset;

    #ifdef USE_FADING
    #include <fading_vertex>
    #endif
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

varying vec3 vColor;

#ifdef USE_EXTRUSION
#include <extrusion_pars_fragment>
#endif

#ifdef USE_FADING
#include <fading_pars_fragment>
#endif

void main() {
    float alphaValue = 1.0;
    gl_FragColor = vec4(vColor, alphaValue);

    #ifdef USE_EXTRUSION
    #include <extrusion_fragment>
    #endif

    #ifdef USE_FADING
    #include <fading_fragment>
    #endif
}`;

/**
 * Parameters used when constructing a new [[EdgeMaterial]].
 */
export interface EdgeMaterialParameters
    extends FadingFeatureParameters,
        DisplacementFeatureParameters {
    /**
     * Edge color.
     */
    color?: number | string;
    /**
     * Color mix value. Mixes between vertexColors and edgeColor.
     */
    colorMix?: number;
}

/**
 * Material designed to render the edges of extruded buildings using GL_LINES. It supports solid
 * colors, vertex colors, color mixing and distance fading.
 */
export class EdgeMaterial extends THREE.RawShaderMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature {
    static DEFAULT_COLOR: number = 0x000000;
    static DEFAULT_COLOR_MIX: number = 0.0;

    /**
     * Constructs a new `EdgeMaterial`.
     *
     * @param params `EdgeMaterial` parameters.
     */
    constructor(params?: EdgeMaterialParameters) {
        const defines: { [key: string]: any } = {};
        const hasDisplacementMap = params !== undefined && params.displacementMap !== undefined;

        if (hasDisplacementMap) {
            defines.USE_DISPLACEMENTMAP = "";
        }

        const shaderParams = {
            name: "EdgeMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
            uniforms: {
                edgeColor: new THREE.Uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR)),
                edgeColorMix: new THREE.Uniform(EdgeMaterial.DEFAULT_COLOR_MIX),
                fadeNear: new THREE.Uniform(FadingFeature.DEFAULT_FADE_NEAR),
                fadeFar: new THREE.Uniform(FadingFeature.DEFAULT_FADE_FAR),
                extrusionRatio: new THREE.Uniform(ExtrusionFeature.DEFAULT_RATIO_MIN),
                displacementMap: new THREE.Uniform(
                    hasDisplacementMap ? params!.displacementMap : new THREE.Texture()
                )
            },
            depthWrite: false,
            defines
        };
        enforceBlending(shaderParams);
        super(shaderParams);

        FadingFeature.patchGlobalShaderChunks();
        ExtrusionFeature.patchGlobalShaderChunks();

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.color !== undefined) {
                this.color.set(params.color as any);
            }
            if (params.colorMix !== undefined) {
                this.colorMix = params.colorMix;
            }
            if (params.fadeNear !== undefined) {
                this.fadeNear = params.fadeNear;
            }
            if (params.fadeFar !== undefined) {
                this.fadeFar = params.fadeFar;
            }

            if (params.displacementMap !== undefined) {
                this.displacementMap = params.displacementMap;
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

    private updateColorMixFeature(): void {
        this.defines.USE_COLOR = this.colorMix > 0.0 ? 1 : 0;
    }

    get fadeNear(): number {
        return this.uniforms.fadeNear.value as number;
    }
    set fadeNear(value: number) {
        this.uniforms.fadeNear.value = value;
    }

    get fadeFar(): number {
        return this.uniforms.fadeFar.value as number;
    }
    set fadeFar(value: number) {
        this.uniforms.fadeFar.value = value;
        const doFade = value !== undefined && value > 0.0;
        if (doFade) {
            this.needsUpdate = this.needsUpdate || this.defines.USE_FADING === undefined;
            this.defines.USE_FADING = "";
        } else {
            this.needsUpdate = this.needsUpdate || this.defines.USE_FADING !== undefined;
            delete this.defines.USE_FADING;
        }
    }

    get extrusionRatio(): number {
        return this.uniforms.extrusionRatio.value as number;
    }
    set extrusionRatio(value: number) {
        this.uniforms.extrusionRatio.value = value;
        const doExtrusion = value !== undefined && value >= ExtrusionFeature.DEFAULT_RATIO_MIN;
        if (doExtrusion) {
            this.needsUpdate = this.needsUpdate || this.defines.USE_EXTRUSION === undefined;
            this.defines.USE_EXTRUSION = "";
        } else {
            this.needsUpdate = this.needsUpdate || this.defines.USE_EXTRUSION !== undefined;
            delete this.defines.USE_EXTRUSION;
        }
    }

    get displacementMap(): THREE.Texture | undefined {
        return this.uniforms.displacementMap.value;
    }

    set displacementMap(map: THREE.Texture | undefined) {
        this.uniforms.displacementMap.value = map;
        if (map !== undefined) {
            this.uniforms.displacementMap.value.needsUpdate = true;
            this.defines.USE_DISPLACEMENTMAP = "";
            this.needsUpdate = this.needsUpdate || this.defines.USE_DISPLACEMENTMAP === undefined;
        } else {
            delete this.defines.USE_DISPLACEMENTMAP;
            this.needsUpdate = this.needsUpdate || this.defines.USE_DISPLACEMENTMAP !== undefined;
        }
    }
}
