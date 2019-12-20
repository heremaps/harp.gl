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
import { enforceBlending } from "./Utils";

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
uniform vec2 drawRange;

#ifdef USE_DISPLACEMENTMAP
uniform sampler2D displacementMap;
#endif

varying vec3 vPosition;
varying vec3 vRange;
varying vec4 vCoords;
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
    // Calculate the segment.
    vec2 segment = abs(extrusionCoord.xy) - SEGMENT_OFFSET;
    float segmentPos = sign(extrusionCoord.x) / 2.0 + 0.5;

    // Calculate the vertex position inside the line (segment) and extrusion direction and factor.
    float linePos = mix(segment.x, segment.y, segmentPos);
    vec2 extrusionDir = sign(extrusionCoord.xy);
    float extrusionFactor = extrusionDir.y * tan(bitangent.w / 2.0);

    // Calculate the extruded vertex position (and scale the extrusion direction).
    vec3 pos = extrudeLine(
        position, linePos, lineWidth + outlineWidth, bitangent, tangent, extrusionDir);

    // Store the normalized extrusion coordinates in vCoords (with their ranges in vRange).
    vRange = vec3(extrusionCoord.z, lineWidth, extrusionFactor);
    vCoords = vec4(extrusionDir / vRange.xy, segment / vRange.x);

    // Adjust the segment to fit the drawRange.
    float capDist = (lineWidth + outlineWidth) / extrusionCoord.z;
    if ((vCoords.w + capDist) < drawRange.x || (vCoords.z - capDist) > drawRange.y) {
        vCoords.zw += 1.0;
    }
    if (vCoords.z < drawRange.x) {
        vCoords.zw += vec2(drawRange.x - vCoords.z, 0.0);
    }
    if (vCoords.w > drawRange.y) {
        vCoords.zw -= vec2(0.0, vCoords.w - drawRange.y);
    }

    // Transform position.
    #ifdef USE_DISPLACEMENTMAP
    pos += normalize( normal ) * texture2D( displacementMap, uv ).x;
    #endif
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Pass extruded position to fragment shader.
    vPosition = pos;

    #if USE_COLOR
    // Pass vertex color to fragment shader.
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
uniform vec2 drawRange;

#if DASHED_LINE
uniform float dashSize;
uniform float gapSize;
uniform vec3 dashColor;
#endif

varying vec3 vPosition;
varying vec3 vRange;
varying vec4 vCoords;
#if USE_COLOR
varying vec3 vColor;
#endif

#include <round_edges_and_add_caps>
#include <tile_clip_func>

#ifdef USE_FADING
#include <fading_pars_fragment>
#endif

#include <fog_pars_fragment>

void main() {
    float alpha = opacity;
    vec3 outputDiffuse = diffuse;

    #if TILE_CLIP
    tileClip(vPosition.xy, tileSize);
    #endif

    // Calculate distance to center (0.0: lineCenter, 1.0: lineEdge).
    float distToCenter = roundEdgesAndAddCaps(vCoords, vRange);
    // Calculate distance to edge (-1.0: lineCenter, 0.0: lineEdge).
    float distToEdge = distToCenter - (lineWidth + outlineWidth) / lineWidth;

    // Decrease the line opacity by the distToEdge, making the transition steeper when the slope
    // of distToChange increases (i.e. the line is further away).
    float width = fwidth(distToEdge);
    alpha *= (1.0 - smoothstep(-width, width, distToEdge));

    #if DASHED_LINE
    // Compute the distance to the dash origin (0.0: dashOrigin, 1.0: dashEnd, (d+g)/d: gapEnd).
    float d = dashSize / vRange.x;
    float g = gapSize / vRange.x;
    float distToDashOrigin = mod(vCoords.x, d + g) / d;

    // Compute distance to dash edge (0.5: dashCenter, 0.0: dashEdge) and compute the
    // dashBlendFactor similarly on how we did it for the line opacity.
    float distToDashEdge = 0.5 - distance(distToDashOrigin, (d + g) / d * 0.5);
    float dashWidth = fwidth(distToDashEdge);
    float dashBlendFactor = 1.0 - smoothstep(-dashWidth, dashWidth, distToDashEdge);

    #if USE_DASH_COLOR
    outputDiffuse = mix(diffuse, dashColor, dashBlendFactor);
    #endif
    #endif

    #ifdef USE_OUTLINE
    // Calculate distance to outline (0.0: lineEdge, outlineWidth/lineWidth: outlineEdge) and
    // compute the outlineBlendFactor (used to mix line and outline colors).
    float distToOutline = distToCenter - 1.0;
    float outlineWidth = fwidth(distToOutline);
    float outlineBlendFactor = smoothstep(-outlineWidth, outlineWidth, distToOutline);

    // Mix the colors using the different computed factors.
    #if DASHED_LINE && USE_DASH_COLOR == 0
    float colorBlendFactor = smoothstep(-1.0, 1.0, dashBlendFactor - outlineBlendFactor);
    outputDiffuse = mix(
      mix(
        mix(outlineColor, diffuse, colorBlendFactor),
        outputDiffuse,
        dashBlendFactor
      ),
      outlineColor,
      outlineBlendFactor
    );
    #else
    outputDiffuse = mix(outputDiffuse, outlineColor, outlineBlendFactor);
    #endif
    #endif

    // Multiply the alpha by the dashBlendFactor.
    #if DASHED_LINE && defined(USE_OUTLINE) && USE_DASH_COLOR == 0
    alpha *= clamp(dashBlendFactor + outlineBlendFactor, 0.0, 1.0);
    #elif DASHED_LINE && USE_DASH_COLOR == 0
    alpha *= 1.0 - dashBlendFactor;
    #endif

    #if USE_COLOR
    gl_FragColor = vec4( outputDiffuse * vColor, alpha );
    #else
    gl_FragColor = vec4( outputDiffuse, alpha );
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

    /**
     * Describes the starting drawing position for the line (in the range [0...1]).
     * Default is `0.0`.
     */
    drawRangeStart?: number;

    /**
     * Describes the ending drawing position for the line (in the range [0...1]).
     * Default is `1.0`.
     */
    drawRangeEnd?: number;

    /**
     * Line dashes color.
     */
    dashColor?: number | string;

    /**
     * Size of the dashed segments.
     */
    dashSize?: number;

    /**
     * Size of the gaps between dashed segments.
     */
    gapSize?: number;
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
    static DEFAULT_DRAW_RANGE_START: number = 0.0;
    static DEFAULT_DRAW_RANGE_END: number = 1.0;
    static DEFAULT_DASH_SIZE: number = 1.0;
    static DEFAULT_GAP_SIZE: number = 1.0;

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
            USE_DASH_COLOR: 0,
            CAPS_SQUARE: 0,
            CAPS_ROUND: 1,
            CAPS_NONE: 0,
            CAPS_TRIANGLE_IN: 0,
            CAPS_TRIANGLE_OUT: 0
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

        const shaderParams: THREE.ShaderMaterialParameters = {
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
                    ),
                    drawRange: new THREE.Uniform(
                        new THREE.Vector2(
                            SolidLineMaterial.DEFAULT_DRAW_RANGE_START,
                            SolidLineMaterial.DEFAULT_DRAW_RANGE_END
                        )
                    ),
                    dashSize: new THREE.Uniform(SolidLineMaterial.DEFAULT_DASH_SIZE),
                    gapSize: new THREE.Uniform(SolidLineMaterial.DEFAULT_GAP_SIZE)
                },
                // We need the fog uniforms available when we use `updateFog` as the internal
                // recompilation cannot add or remove uniforms.
                THREE.UniformsLib.fog
            ]),
            defines,
            fog: true
        };

        enforceBlending(shaderParams);

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
            if (params.caps !== undefined) {
                this.caps = params.caps;
            }
            if (params.drawRangeStart !== undefined) {
                this.drawRangeStart = params.drawRangeStart;
            }
            if (params.drawRangeEnd !== undefined) {
                this.drawRangeEnd = params.drawRangeEnd;
            }
            if (params.dashColor !== undefined) {
                this.dashColor.set(params.dashColor as any);
                this.defines.USE_DASH_COLOR = 1.0;
            }
            if (params.dashSize !== undefined) {
                this.dashSize = params.dashSize;
            }
            if (params.gapSize !== undefined) {
                this.gapSize = params.gapSize;
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

    /**
     * Outline color.
     */
    get outlineColor(): THREE.Color {
        return this.uniforms.outlineColor.value as THREE.Color;
    }
    set outlineColor(value: THREE.Color) {
        this.uniforms.outlineColor.value = value;
    }

    /**
     * Dash color.
     */
    get dashColor(): THREE.Color {
        return this.uniforms.dashColor.value as THREE.Color;
    }
    set dashColor(value: THREE.Color) {
        this.uniforms.dashColor.value = value;
        this.defines.USE_DASH_COLOR = 1.0;
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

    /**
     * Outline width.
     */
    get outlineWidth(): number {
        return this.uniforms.outlineWidth.value as number;
    }
    set outlineWidth(value: number) {
        this.uniforms.outlineWidth.value = value;
        this.updateOutline(value > 0);
    }

    /**
     * Size of the dashed segments.
     */
    get dashSize(): number {
        return this.uniforms.dashSize.value as number;
    }
    set dashSize(value: number) {
        this.uniforms.dashSize.value = value;
    }

    /**
     * Size of the gaps between dashed segments.
     */
    get gapSize(): number {
        return this.uniforms.gapSize.value as number;
    }
    set gapSize(value: number) {
        this.uniforms.gapSize.value = value;
        this.defines.DASHED_LINE = this.gapSize > 0.0 ? 1 : 0;
    }

    /**
     * Caps mode.
     */
    get caps(): LineCaps {
        let result: LineCaps = "Round";
        if (this.defines.CAPS_SQUARE === 1) {
            result = "Square";
        } else if (this.defines.CAPS_NONE === 1) {
            result = "None";
        } else if (this.defines.CAPS_ROUND === 1) {
            result = "Round";
        } else if (this.defines.CAPS_TRIANGLE_IN === 1) {
            result = "TriangleIn";
        } else if (this.defines.CAPS_TRIANGLE_OUT === 1) {
            result = "TriangleOut";
        }
        return result;
    }
    set caps(value: LineCaps) {
        this.defines.CAPS_SQUARE = 0;
        this.defines.CAPS_ROUND = 0;
        this.defines.CAPS_NONE = 0;
        this.defines.CAPS_TRIANGLE_IN = 0;
        this.defines.CAPS_TRIANGLE_OUT = 0;
        this.defines[LineCapsDefinitions[value]] = 1;
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

    get drawRangeStart(): number {
        return this.uniforms.drawRange.value.x as number;
    }
    set drawRangeStart(value: number) {
        this.uniforms.drawRange.value.x = value;
    }

    get drawRangeEnd(): number {
        return this.uniforms.drawRange.value.y as number;
    }
    set drawRangeEnd(value: number) {
        this.uniforms.drawRange.value.y = value;
    }
}
