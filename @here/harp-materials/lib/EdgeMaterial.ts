/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { DisplacementFeature, DisplacementFeatureParameters } from "./DisplacementFeature";
import {
    ExtrusionFeature,
    ExtrusionFeatureParameters,
    FadingFeature,
    FadingFeatureParameters
} from "./MapMeshMaterials";
import { ExtrusionFeatureDefs } from "./MapMeshMaterialsDefs";
import {
    RawShaderMaterial,
    RawShaderMaterialParameters,
    RendererMaterialParameters
} from "./RawShaderMaterial";
import { enforceBlending, setShaderDefine, setShaderMaterialDefine } from "./Utils";

const vertexSource: string = `
#define EDGE_DEPTH_OFFSET 0.0001

#ifdef USE_COLOR
attribute vec4 color;
#else
uniform vec3 color;
#endif

// SHADER_NAME may be defined by THREE.JS own shaders in which case these attributes & uniforms are
// already defined
#ifndef SHADER_NAME
attribute vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
#endif

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

    vColor = mix(edgeColor.rgb, color.rgb, edgeColorMix);

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
 * Parameters used when constructing a new {@link EdgeMaterial}.
 */
export interface EdgeMaterialParameters
    extends FadingFeatureParameters,
        DisplacementFeatureParameters,
        ExtrusionFeatureParameters,
        RendererMaterialParameters {
    /**
     * Edge color.
     */
    color?: number | string;
    /**
     * Color mix value. Mixes between vertexColors and edgeColor.
     */
    colorMix?: number;

    /**
     * Defines whether vertex coloring is used.
     * @defaultValue false
     */
    vertexColors?: boolean;
}

/**
 * Material designed to render the edges of extruded buildings using GL_LINES. It supports solid
 * colors, vertex colors, color mixing and distance fading.
 */
export class EdgeMaterial
    extends RawShaderMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature {
    static DEFAULT_COLOR: number = 0x000000;
    static DEFAULT_COLOR_MIX: number = 0.0;

    /**
     * Constructs a new `EdgeMaterial`.
     *
     * @param params - `EdgeMaterial` parameters. Always required except when cloning another
     * material.
     */
    constructor(params?: EdgeMaterialParameters) {
        let shaderParams: RawShaderMaterialParameters | undefined;
        if (params) {
            const defines: { [key: string]: any } = {};
            const hasExtrusion =
                params.extrusionRatio !== undefined &&
                params.extrusionRatio >= ExtrusionFeatureDefs.DEFAULT_RATIO_MIN &&
                params.extrusionRatio < ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
            if (params.displacementMap) {
                setShaderDefine(defines, "USE_DISPLACEMENTMAP", true);
            }
            if (hasExtrusion) {
                setShaderDefine(defines, "USE_EXTRUSION", true);
            }
            if (params.vertexColors === true) {
                setShaderDefine(defines, "USE_COLOR", true);
            }
            shaderParams = {
                name: "EdgeMaterial",
                vertexShader: vertexSource,
                fragmentShader: fragmentSource,
                uniforms: {
                    color: new THREE.Uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR)),
                    edgeColor: new THREE.Uniform(new THREE.Color(EdgeMaterial.DEFAULT_COLOR)),
                    edgeColorMix: new THREE.Uniform(EdgeMaterial.DEFAULT_COLOR_MIX),
                    fadeNear: new THREE.Uniform(FadingFeature.DEFAULT_FADE_NEAR),
                    fadeFar: new THREE.Uniform(FadingFeature.DEFAULT_FADE_FAR),
                    extrusionRatio: new THREE.Uniform(ExtrusionFeatureDefs.DEFAULT_RATIO_MAX),
                    displacementMap: new THREE.Uniform(
                        params.displacementMap ?? new THREE.Texture()
                    )
                },
                depthWrite: false,
                defines,
                rendererCapabilities: params.rendererCapabilities
            };
        }
        super(shaderParams);
        enforceBlending(this);

        FadingFeature.patchGlobalShaderChunks();
        ExtrusionFeature.patchGlobalShaderChunks();

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.color !== undefined) {
                // Color may be set directly on object (omitting class setter), because we already
                // know that is does no require any special handling nor material update
                // (see: set color()).
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
            if (params.extrusionRatio !== undefined) {
                this.extrusionRatio = params.extrusionRatio;
            }
        }
    }

    /**
     * The color of the object that is rendered
     * together with this edge.
     *
     * @remarks
     * The final color of the edge is computed by
     * interpolating the {@link edgeColor} with this color
     * using the {@link colorMix} factor.
     *
     * Note that {@link objectColor} is used only
     * when the geometry associated with this material
     * does not have a vertex color buffer.
     *
     */
    get objectColor(): THREE.Color {
        return this.uniforms.color.value as THREE.Color;
    }

    set objectColor(value: THREE.Color) {
        this.uniforms.color.value.copy(value);
    }

    /**
     * Edge color.
     */
    get color(): THREE.Color {
        return this.uniforms.edgeColor.value as THREE.Color;
    }

    set color(value: THREE.Color) {
        this.uniforms.edgeColor.value.copy(value);
    }

    get lineWidth(): number {
        return this.linewidth;
    }

    /**
     * Only lineWidth of 0 and 1 is supported.
     * lineWidth <= 0 will result in not visible lines, everything else into lines
     * visible with lineWidth 1
     */
    set lineWidth(value: number) {
        this.linewidth = value;
        if (this.linewidth <= 0) {
            this.visible = false;
        } else {
            this.visible = true;
        }
    }

    /**
     * Color mix value. Mixes between vertexColors and edgeColor.
     */
    get colorMix(): number {
        return this.uniforms.edgeColorMix.value as number;
    }

    set colorMix(value: number) {
        if (this.uniforms.edgeColorMix.value === value) {
            return;
        }
        this.uniforms.edgeColorMix.value = value;
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
        if (this.uniforms.fadeFar.value === value) {
            return;
        }
        this.uniforms.fadeFar.value = value;
        setShaderMaterialDefine(this, "USE_FADING", value > 0.0);
    }

    get extrusionRatio(): number {
        return this.uniforms.extrusionRatio.value as number;
    }

    set extrusionRatio(value: number) {
        if (this.uniforms.extrusionRatio.value === value) {
            return;
        }
        this.uniforms.extrusionRatio.value = value;
        // NOTE: We could also disable shader extrusion chunks when it hits
        // ExtrusionFeatureDefs.DEFAULT_RATIO_MAX value, but this would cause shader re-compile.
        const useExtrusion = value >= ExtrusionFeatureDefs.DEFAULT_RATIO_MIN;
        setShaderMaterialDefine(this, "USE_EXTRUSION", useExtrusion);
    }

    get displacementMap(): THREE.Texture | null {
        return this.uniforms.displacementMap.value;
    }

    set displacementMap(map: THREE.Texture | null) {
        if (this.uniforms.displacementMap.value === map) {
            return;
        }
        this.uniforms.displacementMap.value = map;
        const useDisplacementMap = map !== null;
        if (useDisplacementMap) {
            this.uniforms.displacementMap.value.needsUpdate = true;
        }
        setShaderMaterialDefine(this, "USE_DISPLACEMENTMAP", useDisplacementMap);
    }
}
