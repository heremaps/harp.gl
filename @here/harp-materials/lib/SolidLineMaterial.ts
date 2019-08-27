/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    DisplacementFeature,
    DisplacementFeatureParameters,
    FadingFeature,
    FadingFeatureParameters
} from "./MapMeshMaterials";
import linesShaderChunk from "./ShaderChunks/LinesChunks";

const vertexSource: string = `
#define SEGMENT_OFFSET 0.1

attribute vec2 extrusionCoord;
attribute vec3 position;
attribute vec4 bitangent;
attribute vec3 tangent;
attribute vec2 uv;
attribute vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float lineWidth;

#ifdef USE_DISPLACEMENTMAP
uniform sampler2D displacementMap;
#endif

varying vec2 vExtrusionCoord;
varying vec2 vSegment;
varying float vLinewidth;
varying vec3 vPosition;

#if USE_COLOR
attribute vec3 color;
varying vec3 vColor;
#endif

#ifdef USE_FADING
#include <fading_pars_vertex>
#endif

#include <fog_pars_vertex>

#include <extrude_line_vert_func>

void main() {
    vLinewidth = lineWidth;
    vSegment = abs(extrusionCoord) - SEGMENT_OFFSET;

    vec3 pos = position;
    vec2 extrusionDir = sign(extrusionCoord);

    extrudeLine(vSegment, bitangent, tangent, lineWidth, pos, extrusionDir);

    #ifdef USE_DISPLACEMENTMAP
    pos += normalize( normal ) * texture2D( displacementMap, uv ).x;
    #endif

    vPosition = pos;
    vExtrusionCoord = vec2(extrusionDir.x, extrusionDir.y * lineWidth);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #if USE_COLOR
    vColor = color;
    #endif

    #ifdef USE_FADING
    #include <fading_vertex>
    #endif

    #include <fog_vertex>
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

uniform vec3 diffuse;
uniform float opacity;
uniform vec2 tileSize;
#if DASHED_LINE
uniform float dashSize;
uniform float gapSize;
#endif

varying vec2 vExtrusionCoord;
varying vec2 vSegment;
varying float vLinewidth;
varying vec3 vPosition;

#if USE_COLOR
varying vec3 vColor;
#endif

#include <join_dist_func>
#include <tile_clip_func>

#ifdef USE_FADING
#include <fading_pars_fragment>
#endif

#include <fog_pars_fragment>

void main() {

    float alpha = opacity;

    #if TILE_CLIP
    tileClip(vPosition.xy, tileSize);
    #endif

    float dist = joinDist(vSegment, vExtrusionCoord) - vLinewidth;
    float width = fwidth(dist);
    alpha *= (1.0 - smoothstep(-width, width, dist));

    #if DASHED_LINE
    float halfSegment = (dashSize + gapSize) / dashSize * 0.5;
    float segmentDist = mod(vExtrusionCoord.x, dashSize + gapSize) / dashSize;
    float dashDist = 0.5 - distance(segmentDist, halfSegment);
    float dashWidth = fwidth(dashDist);
    alpha *= smoothstep(-dashWidth, dashWidth, dashDist);
    #endif

    #if USE_COLOR
    gl_FragColor = vec4( diffuse * vColor, alpha );
    #else
    gl_FragColor = vec4( diffuse, alpha );
    #endif

    #include <fog_fragment>

    #ifdef USE_FADING
    #include <fading_fragment>
    #endif
}`;

/**
 * Parameters used when constructing a new [[SolidLineMaterial]].
 */
export interface SolidLineMaterialParameters
    extends FadingFeatureParameters,
        DisplacementFeatureParameters {
    /**
     * Line color.
     */
    color?: number | string;

    /**
     * Enables/Disable depth test.
     */
    depthTest?: boolean;

    /**
     * Enables/Disable depth write.
     */
    depthWrite?: boolean;

    /**
     * `SolidLineMaterial` extends the ThreeJS `RawShaderMaterial` that does not update fog at
     * runtime, so instead of recompiling everything we pass it in the constructor.
     */
    fog?: boolean;

    /**
     * Line width.
     */
    lineWidth?: number;

    /**
     * Line opacity.
     */
    opacity?: number;
}

/**
 * Material designed to render solid variable-width lines.
 */
export class SolidLineMaterial extends THREE.RawShaderMaterial
    implements DisplacementFeature, FadingFeature {
    static DEFAULT_COLOR: number = 0xff0000;
    static DEFAULT_WIDTH: number = 1.0;
    static DEFAULT_OPACITY: number = 1.0;

    /**
     * Constructs a new `SolidLineMaterial`.
     *
     * @param params `SolidLineMaterial` parameters.
     */
    constructor(params?: SolidLineMaterialParameters) {
        Object.assign(THREE.ShaderChunk, linesShaderChunk);

        FadingFeature.patchGlobalShaderChunks();

        const defines: { [key: string]: any } = {
            DASHED_LINE: 0,
            TILE_CLIP: 0,
            USE_COLOR: 0
        };

        const hasFog = params !== undefined && params.fog === true;

        if (hasFog) {
            defines.USE_FOG = "";
        }

        const hasDisplacementMap = params !== undefined && params.displacementMap !== undefined;

        if (hasDisplacementMap) {
            defines.USE_DISPLACEMENTMAP = "";
        }

        const shaderParams = {
            name: "SolidLineMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
            uniforms: THREE.UniformsUtils.merge([
                {
                    diffuse: new THREE.Uniform(new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)),
                    lineWidth: new THREE.Uniform(SolidLineMaterial.DEFAULT_WIDTH),
                    opacity: new THREE.Uniform(SolidLineMaterial.DEFAULT_OPACITY),
                    tileSize: new THREE.Uniform(new THREE.Vector2()),
                    fadeNear: new THREE.Uniform(FadingFeature.DEFAULT_FADE_NEAR),
                    fadeFar: new THREE.Uniform(FadingFeature.DEFAULT_FADE_FAR),
                    displacementMap: new THREE.Uniform(
                        hasDisplacementMap ? params!.displacementMap : new THREE.Texture()
                    )
                },
                // We need the fog uniforms available when we use `updateFog` as the internal
                // recompilation cannot add or remove uniforms.
                THREE.UniformsLib.fog
            ]),
            defines,
            transparent: true,
            fog: true
        };

        super(shaderParams);
        this.extensions.derivatives = true;

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.color !== undefined) {
                this.color.set(params.color as any);
            }
            if (params.lineWidth !== undefined) {
                this.lineWidth = params.lineWidth;
            }
            if (params.opacity !== undefined) {
                this.opacity = params.opacity;
            }
            if (params.depthTest !== undefined) {
                this.depthTest = params.depthTest;
            }
            if (params.depthWrite !== undefined) {
                this.depthWrite = params.depthWrite;
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
            this.fog = hasFog;
        }
    }

    /**
     * The method to call to recompile a material to get a new fog define.
     *
     * @param enableFog Whether we want to enable the fog.
     */
    updateFog(enableFog: boolean) {
        if (!enableFog) {
            delete this.defines.USE_FOG;
        } else {
            this.defines.USE_FOG = "";
        }
    }

    /**
     * Line opacity.
     */
    get opacity(): number {
        return this.uniforms.opacity.value;
    }
    set opacity(value: number) {
        if (this.uniforms !== undefined) {
            this.uniforms.opacity.value = value;
        }
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
     * Line width.
     */
    get lineWidth(): number {
        return this.uniforms.lineWidth.value as number;
    }
    set lineWidth(value: number) {
        this.uniforms.lineWidth.value = value;
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
        const fadeFar = this.uniforms.fadeFar.value;
        this.uniforms.fadeFar.value = value;
        const doFade = fadeFar !== undefined && fadeFar > 0.0;
        if (doFade) {
            this.defines.USE_FADING = "";
        } else {
            delete this.defines.USE_FADING;
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
        } else {
            delete this.defines.USE_DISPLACEMENTMAP;
        }
        this.needsUpdate = true;
    }
}
