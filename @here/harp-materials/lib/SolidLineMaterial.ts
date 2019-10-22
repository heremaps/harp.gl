/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LineCaps } from "@here/harp-datasource-protocol";
import * as THREE from "three";
import {
    DisplacementFeature,
    DisplacementFeatureParameters,
    FadingFeature,
    FadingFeatureParameters
} from "./MapMeshMaterials";
import linesShaderChunk from "./ShaderChunks/LinesChunks";

export const LineCapsDefinitions: { [key in LineCaps]: string } = {
    Square: "CAPS_SQUARE",
    Round: "CAPS_ROUND",
    None: "CAPS_NONE",
    TriangleIn: "CAPS_TRIANGLE_IN",
    TriangleOut: "CAPS_TRIANGLE_OUT"
};

/**
 * The vLength contains the actual line length, it's needed for the creation of line caps by
 * detecting line ends. `vLength == vExtrusionCoord.x + lineWidth * 2`
 */
/**
 * The vExtrusionStrength relies on the edges of the lines. Represents how far the current point was
 * extruded on the edges because of the current angle. Needed for preventing line caps artifacts on
 * sharp line edges. For example, on sharp edges, some vertices can be extruded much further than
 * the full line length.
 */

const vertexSource: string = `
#define SEGMENT_OFFSET 0.1

attribute vec3 extrusionCoord;
attribute vec3 position;
attribute vec4 bitangent;
attribute vec3 tangent;
attribute vec2 uv;
attribute vec3 normal;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float lineWidth;
uniform float outlineWidth;

#ifdef USE_DISPLACEMENTMAP
uniform sampler2D displacementMap;
#endif

varying vec2 vExtrusionCoord;
varying vec2 vSegment;
varying float vResultLineWidth;
varying vec3 vPosition;
varying float vLength;
varying float vExtrusionStrength;
varying float vLololo;

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
    vResultLineWidth = lineWidth + outlineWidth;
    vSegment = abs(extrusionCoord.xy) - SEGMENT_OFFSET;
    vLength = extrusionCoord.z;

    vec3 pos = position;
    vec2 extrusionDir = sign(extrusionCoord.xy);
    vExtrusionStrength = extrusionDir.y * tan(bitangent.w / 2.0);

    // float vLololo = vLength + extrusionDir.x * vResultLineWidth;


    extrudeLine(vSegment, bitangent, tangent, vResultLineWidth, pos, extrusionDir);

    #ifdef USE_DISPLACEMENTMAP
    pos += normalize( normal ) * texture2D( displacementMap, uv ).x;
    #endif

    vPosition = pos;
    vExtrusionCoord = vec2(extrusionDir.x, extrusionDir.y * vResultLineWidth);

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
uniform vec3 outlineColor;
uniform float opacity;
uniform float lineWidth;
uniform float outlineWidth;
uniform vec2 tileSize;

#if DASHED_LINE
uniform float dashSize;
uniform float gapSize;
uniform vec3 dashColor;
#endif

varying vec2 vExtrusionCoord;
varying vec2 vSegment;
varying float vResultLineWidth;
varying vec3 vPosition;
varying float vLength;
varying float vExtrusionStrength;
varying float vLololo;

#if USE_COLOR
varying vec3 vColor;
#endif

#include <join_dist_func>
#include <round_edges_and_add_caps>
#include <tile_clip_func>

#ifdef USE_FADING
#include <fading_pars_fragment>
#endif

#include <fog_pars_fragment>

void main() {
    float alpha = opacity;
    vec3 outputDiffuse = diffuse;

    float lineEnds = max(vExtrusionCoord.x - vLength,- vExtrusionCoord.x);

    #if TILE_CLIP
    // tileClip(vPosition.xy, tileSize);
    #endif

    float pointDist = roundEdgesAndAddCaps(vSegment, vExtrusionCoord, lineEnds, vExtrusionStrength);
    float dist = pointDist - vResultLineWidth;
    float width = fwidth(dist);
    alpha *= (1.0 - smoothstep(-width, width, dist));

    #if DASHED_LINE
    float dSegment = dashSize + gapSize;
    float fullLength = vLength ;
    float correction = (fullLength / dSegment) / ceil(fullLength / dSegment);
    float cDashSize = dashSize * correction;
    float cGapSize = gapSize * correction;

    float halfSegment = (cDashSize + cGapSize) / cDashSize * 0.5;
    float segmentDist = mod(vExtrusionCoord.x + ((cDashSize + cGapSize) *0.5) , cDashSize + cGapSize) / cDashSize;
    float dashDist = 0.5 - distance(segmentDist, halfSegment);
    float dashWidth = fwidth(dashDist);
    float dashedBlendFactor = 1.0 - smoothstep(-dashWidth, dashWidth, dashDist);



    #if USE_DASH_COLOR
    outputDiffuse = mix(diffuse, dashColor, dashedBlendFactor);
    #endif
    #endif

    #ifdef USE_OUTLINE
    float outlineDist = pointDist - lineWidth;
    float outlineFWidth = fwidth(outlineDist);
    float outlineBlendFactor = smoothstep(-outlineFWidth, outlineFWidth, outlineDist);

    #if DASHED_LINE && USE_DASH_COLOR == 0
    float colorBlendFactor = smoothstep(-1.0, 1.0, dashedBlendFactor - outlineBlendFactor);

    outputDiffuse = mix(
      mix(
        mix(outlineColor, diffuse, colorBlendFactor),
        outputDiffuse,
        dashedBlendFactor
      ),
      outlineColor,
      outlineBlendFactor
    );
    #else
    outputDiffuse = mix(outputDiffuse, outlineColor, outlineBlendFactor);
    #endif
    #endif

    #if DASHED_LINE && defined(USE_OUTLINE) && USE_DASH_COLOR == 0
    alpha *= clamp(dashedBlendFactor + outlineBlendFactor, 0.0, 1.0);
    #elif DASHED_LINE && USE_DASH_COLOR == 0
    alpha *= 1.0 - dashedBlendFactor;
    #endif

    #if USE_COLOR
    gl_FragColor = vec4( outputDiffuse * vColor, alpha );
    #else
    gl_FragColor = vec4( outputDiffuse,  alpha );
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
     * Line outline color.
     */
    outlineColor?: number | string;

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
     * Outline width.
     */
    outlineWidth?: number;

    /**
     * Line opacity.
     */
    opacity?: number;

    /**
     * Describes line caps type (`"None"`, `"Round"`, `"Square"`, `"TriangleOut"`, `"TriangleIn"`).
     * Default is `"Round"`.
     */
    caps?: LineCaps;
}

/**
 * Material designed to render solid variable-width lines.
 */
export class SolidLineMaterial extends THREE.RawShaderMaterial
    implements DisplacementFeature, FadingFeature {
    static DEFAULT_COLOR: number = 0xff0000;
    static DEFAULT_WIDTH: number = 1.0;
    static DEFAULT_OUTLINE_WIDTH: number = 0.0;
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
            USE_COLOR: 0,
            USE_DASH_COLOR: 0
        };

        const hasFog = params !== undefined && params.fog === true;

        if (hasFog) {
            defines.USE_FOG = "";
        }

        const hasDisplacementMap = params !== undefined && params.displacementMap !== undefined;

        if (hasDisplacementMap) {
            defines.USE_DISPLACEMENTMAP = "";
        }

        if (params !== undefined && params.outlineWidth !== undefined && params.outlineWidth > 0) {
            defines.USE_OUTLINE = "";
        }

        const shaderParams = {
            name: "SolidLineMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
            uniforms: THREE.UniformsUtils.merge([
                {
                    diffuse: new THREE.Uniform(new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)),
                    dashColor: new THREE.Uniform(new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)),
                    outlineColor: new THREE.Uniform(
                        new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)
                    ),
                    lineWidth: new THREE.Uniform(SolidLineMaterial.DEFAULT_WIDTH),
                    outlineWidth: new THREE.Uniform(SolidLineMaterial.DEFAULT_OUTLINE_WIDTH),
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
            if (params.outlineColor !== undefined) {
                this.outlineColor.set(params.outlineColor as any);
            }
            if (params.lineWidth !== undefined) {
                this.lineWidth = params.lineWidth;
            }
            if (params.outlineWidth !== undefined) {
                this.outlineWidth = params.outlineWidth;
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
            if (params.caps !== undefined && LineCapsDefinitions.hasOwnProperty(params.caps)) {
                defines[LineCapsDefinitions[params.caps]] = 1;
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
     * The method to call to recompile a material to an outline effect
     *
     * @param enableOutline Whether we want to use outline.
     */
    updateOutline(enableOutline: boolean) {
        if (!enableOutline) {
            delete this.defines.USE_OUTLINE;
        } else {
            this.defines.USE_OUTLINE = "";
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

    get outlineColor(): THREE.Color {
        return this.uniforms.outlineColor.value as THREE.Color;
    }
    set outlineColor(value: THREE.Color) {
        this.uniforms.outlineColor.value = value;
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

    get outlineWidth(): number {
        return this.uniforms.outlineWidth.value as number;
    }

    set outlineWidth(value: number) {
        this.uniforms.outlineWidth.value = value;
        this.updateOutline(value > 0);
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
