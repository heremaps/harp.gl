/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LineCaps, LineDashes } from "@here/harp-datasource-protocol";
import * as THREE from "three";

import { DisplacementFeature, DisplacementFeatureParameters } from "./DisplacementFeature";
import { FadingFeature, FadingFeatureParameters } from "./MapMeshMaterials";
import {
    RawShaderMaterial,
    RawShaderMaterialParameters,
    RendererMaterialParameters
} from "./RawShaderMaterial";
import linesShaderChunk, { LineCapsModes } from "./ShaderChunks/LinesChunks";
import {
    enforceBlending,
    getShaderMaterialDefine,
    setShaderDefine,
    setShaderMaterialDefine
} from "./Utils";

const LineCapsDefinesMapping: { [key in LineCaps]: number } = {
    None: LineCapsModes.CAPS_NONE,
    Square: LineCapsModes.CAPS_SQUARE,
    Round: LineCapsModes.CAPS_ROUND,
    TriangleIn: LineCapsModes.CAPS_TRIANGLE_IN,
    TriangleOut: LineCapsModes.CAPS_TRIANGLE_OUT
};

const DefinesLineCapsMapping: { [key: number]: LineCaps } = Object.keys(
    LineCapsDefinesMapping
).reduce((r, lineCapsName) => {
    const defineKey = lineCapsName as keyof typeof LineCapsDefinesMapping;
    const defineValue: number = LineCapsDefinesMapping[defineKey];
    r[defineValue] = defineKey;
    return r;
}, ({} as any) as { [key: number]: LineCaps });

export enum LineDashesModes {
    DASHES_SQUARE = 0,
    DASHES_ROUND,
    DASHES_DIAMOND
}

const LineDashesDefinesMapping: { [key in LineDashes]: number } = {
    Square: LineDashesModes.DASHES_SQUARE,
    Round: LineDashesModes.DASHES_ROUND,
    Diamond: LineDashesModes.DASHES_DIAMOND
};

const DefinesLineDashesMapping: { [key: number]: LineDashes } = Object.keys(
    LineDashesDefinesMapping
).reduce((r, lineDashesName) => {
    const defineKey = lineDashesName as keyof typeof LineDashesDefinesMapping;
    const defineValue: number = LineDashesDefinesMapping[defineKey];
    r[defineValue] = defineKey;
    return r;
}, ({} as any) as { [key: number]: LineDashes });

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

const tmpColor = new THREE.Color();
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
uniform float extrusionWidth;
uniform float outlineWidth;
uniform float offset;
uniform vec2 drawRange;

#ifdef USE_DISPLACEMENTMAP
uniform sampler2D displacementMap;
#endif

#ifdef USE_TILE_CLIP
varying vec3 vPosition;
#endif
varying vec3 vRange;
varying vec4 vCoords;
#ifdef USE_COLOR
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
    // Precompute to avoid computing multiple times
    float tanHalfAngle = tan(bitangent.w / 2.0);
    float extrusionFactor = extrusionDir.y * tanHalfAngle;

    // Calculate the extruded vertex position (and scale the extrusion direction).
    vec3 pos = extrudeLine(
        position, linePos, extrusionWidth + outlineWidth, bitangent, tangent, tanHalfAngle,
        extrusionDir);

    // Store the normalized extrusion coordinates in vCoords (with their ranges in vRange).
    vRange = vec3(extrusionCoord.z, extrusionWidth, extrusionFactor);
    vCoords = vec4(extrusionDir / vRange.xy, segment / vRange.x);

    // Adjust the segment to fit the drawRange.
    float capDist = (extrusionWidth + outlineWidth) / extrusionCoord.z;
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

    // Shift the line based on the offset, where the bitangent is the cross product of the average
    // of the two direction vectors (the previous and next segment directions) and the normal of
    // the line (facing into the sky). The w component is the angle between the two segments.
    // Note, we need to take the angle into consideration, so we use trigonometry to calculate how
    // much we need to extend the offset. Note, orthough this looks complicated we are doing this
    // in the vertex shader, so it should not cause a performance issue.
    pos += bitangent.xyz * offset * sqrt(1.0 + pow(abs(tanHalfAngle), 2.0));

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Pass extruded position to fragment shader.
    #ifdef USE_TILE_CLIP
    vPosition = pos;
    #endif

    #ifdef USE_COLOR
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
uniform float extrusionWidth;
uniform float outlineWidth;
uniform vec2 tileSize;
uniform vec2 drawRange;

#ifdef USE_DASHED_LINE
uniform float dashSize;
uniform float gapSize;
uniform vec3 dashColor;

#define DASHES_SQUARE ${LineDashesModes.DASHES_SQUARE}
#define DASHES_ROUND ${LineDashesModes.DASHES_ROUND}
#define DASHES_DIAMOND ${LineDashesModes.DASHES_DIAMOND}
#endif

#ifdef USE_TILE_CLIP
varying vec3 vPosition;
#endif

varying vec3 vRange;
varying vec4 vCoords;
#ifdef USE_COLOR
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

    #ifdef USE_TILE_CLIP
    tileClip(vPosition.xy, tileSize);
    #endif

    // Calculate distance to center (0.0: lineCenter, 1.0: lineEdge).
    float distToCenter = roundEdgesAndAddCaps(vCoords, vRange);
    // Calculate distance to edge (-1.0: lineCenter, 0.0: lineEdge).
    float distToEdge = distToCenter - (extrusionWidth + outlineWidth) / extrusionWidth;

    // Decrease the line opacity by the distToEdge, making the transition steeper when the slope
    // of distToChange increases (i.e. the line is further away).
    float width = fwidth(distToEdge);

    float s = opacity < 0.98
        ? clamp((distToEdge + width) / (2.0 * width), 0.0, 1.0) // prefer a boxstep
        : smoothstep(-width, width, distToEdge);

    if (opacity < 0.98 && 1.0 - s < opacity) {
        // drop the fragment when the line is using opacity.
        discard;
    }

    alpha *= 1.0 - s;

    #ifdef USE_DASHED_LINE
    // Compute the distance to the dash origin (0.0: dashOrigin, 1.0: dashEnd, (d+g)/d: gapEnd).
    float d = dashSize / vRange.x;
    float g = gapSize / vRange.x;
    float distToDashOrigin = mod(vCoords.x, d + g) / d;

    // Compute distance to dash edge (0.5: dashCenter, 0.0: dashEdge) and compute the
    // dashBlendFactor similarly on how we did it for the line opacity.
    float distToDashEdge = 0.5 - distance(distToDashOrigin, (d + g) / d * 0.5);
    #if DASHES_MODE == DASHES_ROUND
    distToDashEdge = 0.5 - distance(vec2(distToCenter * 0.5, distToDashEdge), vec2(0.0, 0.5));
    #elif DASHES_MODE == DASHES_DIAMOND
    distToDashEdge -= distToCenter * 0.5;
    #endif
    float dashWidth = fwidth(distToDashEdge);
    float dashBlendFactor = 1.0 - smoothstep(-dashWidth, dashWidth, distToDashEdge);

    #ifdef USE_DASH_COLOR
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
    #if defined(USE_DASHED_LINE) && !defined(USE_DASH_COLOR)
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

    #if defined(USE_DASHED_LINE) && !defined(USE_DASH_COLOR)
    // Multiply the alpha by the dashBlendFactor.
    #if defined(USE_OUTLINE)
    alpha *= clamp(dashBlendFactor + outlineBlendFactor, 0.0, 1.0);
    #else
    alpha *= 1.0 - dashBlendFactor;
    #endif
    #endif

    #ifdef USE_COLOR
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
 * Parameters used when constructing a new {@link SolidLineMaterial}.
 */
export interface SolidLineMaterialParameters
    extends FadingFeatureParameters,
        DisplacementFeatureParameters,
        RendererMaterialParameters {
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
     * Describes line dash type (`"Round"`, `"Square"`, `"Diamond"`).
     * Default is `"Square"`.
     */
    dashes?: LineDashes;

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

    /**
     * How much to offset in world units.
     */
    offset?: number;
}

/**
 * Material designed to render solid variable-width lines.
 */
export class SolidLineMaterial
    extends RawShaderMaterial
    implements DisplacementFeature, FadingFeature {
    static DEFAULT_COLOR: number = 0xff0000;
    static DEFAULT_WIDTH: number = 1.0;
    static DEFAULT_OUTLINE_WIDTH: number = 0.0;
    static DEFAULT_OPACITY: number = 1.0;
    static DEFAULT_DRAW_RANGE_START: number = 0.0;
    static DEFAULT_DRAW_RANGE_END: number = 1.0;
    static DEFAULT_DASH_SIZE: number = 1.0;
    static DEFAULT_GAP_SIZE: number = 1.0;
    static DEFAULT_OFFSET: number = 0.0;

    /**
     * Constructs a new `SolidLineMaterial`.
     *
     * @param params - `SolidLineMaterial` parameters. Always required except when cloning another
     * material.
     */
    constructor(params?: SolidLineMaterialParameters) {
        Object.assign(THREE.ShaderChunk, linesShaderChunk);

        FadingFeature.patchGlobalShaderChunks();

        // Setup default defines.
        const defines: { [key: string]: any } = {
            CAPS_MODE: LineCapsModes.CAPS_ROUND,
            DASHES_MODE: LineDashesModes.DASHES_SQUARE
        };

        // Prepare defines based on params passed in, before super class c-tor, this ensures
        // proper set for shader compilation, without need to re-compile.
        let fogParam = true;
        let opacityParam = 1.0;
        let displacementMap;

        let shaderParams: RawShaderMaterialParameters | undefined;
        if (params) {
            fogParam = params.fog === true;
            if (fogParam) {
                setShaderDefine(defines, "USE_FOG", true);
            }
            opacityParam = params.opacity !== undefined ? params.opacity : opacityParam;
            displacementMap = params.displacementMap;
            if (displacementMap !== undefined) {
                setShaderDefine(defines, "USE_DISPLACEMENTMAP", true);
            }
            const hasOutline = params.outlineWidth !== undefined && params.outlineWidth > 0;
            if (hasOutline) {
                setShaderDefine(defines, "USE_OUTLINE", true);
            }
            shaderParams = {
                name: "SolidLineMaterial",
                vertexShader: vertexSource,
                fragmentShader: fragmentSource,
                uniforms: THREE.UniformsUtils.merge([
                    {
                        diffuse: new THREE.Uniform(
                            new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)
                        ),
                        dashColor: new THREE.Uniform(
                            new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)
                        ),
                        outlineColor: new THREE.Uniform(
                            new THREE.Color(SolidLineMaterial.DEFAULT_COLOR)
                        ),
                        extrusionWidth: new THREE.Uniform(SolidLineMaterial.DEFAULT_WIDTH),
                        outlineWidth: new THREE.Uniform(SolidLineMaterial.DEFAULT_OUTLINE_WIDTH),
                        offset: new THREE.Uniform(SolidLineMaterial.DEFAULT_OFFSET),
                        opacity: new THREE.Uniform(SolidLineMaterial.DEFAULT_OPACITY),
                        tileSize: new THREE.Uniform(new THREE.Vector2()),
                        fadeNear: new THREE.Uniform(FadingFeature.DEFAULT_FADE_NEAR),
                        fadeFar: new THREE.Uniform(FadingFeature.DEFAULT_FADE_FAR),
                        displacementMap: new THREE.Uniform(
                            displacementMap !== undefined ? displacementMap : new THREE.Texture()
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
                    // We need the fog uniforms available when we use `fog` setter as the internal
                    // recompilation cannot add or remove uniforms.
                    THREE.UniformsLib.fog
                ]),
                defines,
                // No need to pass overridden `fog` and `opacity` params they will be set
                // after super c-tor call.
                fog: fogParam,
                opacity: opacityParam,
                rendererCapabilities: params.rendererCapabilities
            };
        }

        super(shaderParams);

        // Required to satisfy compiler error if fields has no initializer or are not definitely
        // assigned in the constructor, this also mimics ShaderMaterial set of defaults
        // for overridden props.
        this.fog = fogParam;
        this.setOpacity(opacityParam);

        // initialize the stencil pass
        this.stencilFunc = THREE.NotEqualStencilFunc;
        this.stencilZPass = THREE.ReplaceStencilOp;
        this.stencilRef = 1;
        this.stencilWrite = false;

        enforceBlending(this);
        this.extensions.derivatives = true;

        // Apply initial parameter values.
        if (params) {
            if (params.color !== undefined) {
                tmpColor.set(params.color as any);
                this.color = tmpColor;
            }
            if (params.outlineColor !== undefined) {
                tmpColor.set(params.outlineColor as any);
                this.outlineColor = tmpColor;
            }
            if (params.lineWidth !== undefined) {
                this.lineWidth = params.lineWidth;
            }
            if (params.outlineWidth !== undefined) {
                this.outlineWidth = params.outlineWidth;
            }
            if (params.opacity !== undefined) {
                this.setOpacity(params.opacity);
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
            if (params.dashes !== undefined) {
                this.dashes = params.dashes;
            }
            if (params.dashColor !== undefined) {
                tmpColor.set(params.dashColor as any);
                this.dashColor = tmpColor;
            }
            if (params.dashSize !== undefined) {
                this.dashSize = params.dashSize;
            }
            if (params.gapSize !== undefined) {
                this.gapSize = params.gapSize;
            }
            if (params.fog !== undefined) {
                this.fog = params.fog;
                this.invalidateFog();
            }
            this.offset = params.offset ?? 0;
        }
    }

    /**
     * Sets the offset used to shift the line in world space perpendicular to the direction.
     */
    set offset(offset: number) {
        this.uniforms.offset.value = offset;
    }

    /**
     * @return The offset to shift the line in world space perpendicular to the direction.
     */
    get offset(): number {
        return this.uniforms.offset.value as number;
    }

    /**
     * The method to call to recompile a material to enable/disable outline effect
     *
     * @param enable - Whether we want to use outline.
     */
    set outline(enable: boolean) {
        setShaderMaterialDefine(this, "USE_OUTLINE", enable);
    }

    /**
     * Checks if outline is enabled.
     */
    get outline(): boolean {
        return getShaderMaterialDefine(this, "USE_OUTLINE") === true;
    }

    /** @override */
    setOpacity(opacity: number) {
        super.setOpacity(opacity);
        if (opacity !== undefined) {
            this.stencilWrite = opacity < 0.98;
        }
    }

    /**
     * Line color.
     */
    get color(): THREE.Color {
        return this.uniforms.diffuse.value as THREE.Color;
    }

    set color(value: THREE.Color) {
        this.uniforms.diffuse.value.copy(value);
    }

    /**
     * Outline color.
     *
     * @note The width of outline ([[outlineWidth]]) need to be also set to enable outlining.
     */
    get outlineColor(): THREE.Color {
        return this.uniforms.outlineColor.value as THREE.Color;
    }

    set outlineColor(value: THREE.Color) {
        this.uniforms.outlineColor.value.copy(value);
    }

    /**
     * Dash color.
     *
     * @note The property [[gapSize]] need to be set to enable dashed line.
     */
    get dashColor(): THREE.Color {
        return this.uniforms.dashColor.value as THREE.Color;
    }

    set dashColor(value: THREE.Color) {
        this.uniforms.dashColor.value.copy(value);
        setShaderMaterialDefine(this, "USE_DASH_COLOR", true);
    }

    /**
     * Line width.
     */
    get lineWidth(): number {
        return (this.uniforms.extrusionWidth.value as number) * 2;
    }

    set lineWidth(value: number) {
        this.uniforms.extrusionWidth.value = value / 2;
    }

    /**
     * Outline width.
     */
    get outlineWidth(): number {
        return this.uniforms.outlineWidth.value as number;
    }

    set outlineWidth(value: number) {
        this.uniforms.outlineWidth.value = value;
        this.outline = value > 0.0;
    }

    /**
     * Size of the dashed segments.
     *
     * @note Ths [[gapSize]] need to be also set to enable dashed line.
     * @see gapSize.
     */
    get dashSize(): number {
        return this.uniforms.dashSize.value as number;
    }

    set dashSize(value: number) {
        this.uniforms.dashSize.value = value;
    }

    /**
     * Size of the gaps between dashed segments.
     *
     * @note You may also need to set [[dashSize]].
     * @see dashSize.
     */
    get gapSize(): number {
        return this.uniforms.gapSize.value as number;
    }

    set gapSize(value: number) {
        this.uniforms.gapSize.value = value;
        setShaderMaterialDefine(this, "USE_DASHED_LINE", value > 0.0);

        if (this.uniforms?.gapSize?.value === 0) {
            this.stencilWrite = this.opacity < 0.98;
        }
    }

    /**
     * Caps mode.
     */
    get caps(): LineCaps {
        let result: LineCaps = "Round";
        const capsMode = getShaderMaterialDefine(this, "CAPS_MODE");
        // Sanity check if material define is numerical and has direct mapping to LineCaps type.
        if (typeof capsMode === "number" && DefinesLineCapsMapping.hasOwnProperty(capsMode)) {
            result = DefinesLineCapsMapping[capsMode];
        }
        return result;
    }

    set caps(value: LineCaps) {
        // Line caps mode may be set directly from theme, thus we need to check value
        // for correctness and provide string to define mapping in fragment shader.
        if (LineCapsDefinesMapping.hasOwnProperty(value)) {
            setShaderMaterialDefine(this, "CAPS_MODE", LineCapsDefinesMapping[value]);
        }
    }

    /**
     * Dashes mode.
     */
    get dashes(): LineDashes {
        let result: LineDashes = "Square";
        const dashesMode = getShaderMaterialDefine(this, "DASHES_MODE");
        // Sanity check if material define is numerical and has direct mapping to LineDashes type.
        if (typeof dashesMode === "number" && DefinesLineDashesMapping.hasOwnProperty(dashesMode)) {
            result = DefinesLineDashesMapping[dashesMode];
        }
        return result;
    }

    set dashes(value: LineDashes) {
        // Line dashes mode may be set directly from theme, thus we need to check value
        // for correctness and provide string to define mapping in fragment shader.
        if (LineDashesDefinesMapping.hasOwnProperty(value)) {
            setShaderMaterialDefine(this, "DASHES_MODE", LineDashesDefinesMapping[value]);
        }
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
        setShaderMaterialDefine(this, "USE_FADING", value > 0.0);
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

    set clipTileSize(tileSize: THREE.Vector2) {
        this.uniforms.tileSize.value.copy(tileSize);
        const useTileClip = tileSize.x > 0 && tileSize.y > 0;
        setShaderMaterialDefine(this, "USE_TILE_CLIP", useTileClip);
    }

    get clipTileSize(): THREE.Vector2 {
        return this.uniforms.tileSize.value as THREE.Vector2;
    }

    copy(other: SolidLineMaterial): this {
        super.copy(other);
        this.invalidateFog();
        this.setOpacity(other.opacity);
        return this;
    }
}
