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
attribute vec4 position;
attribute vec4 color;
attribute vec4 uv;
attribute vec2 glyphAxis;
attribute vec2 dummy_for_alignment;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec4 vColor;
varying vec4 vUv;
varying float vWeight;
varying float vBG;

void main() {
    vColor = color;
    vUv = vec4(uv.xy, glyphAxis.xy);
    vWeight = uv.z;
    vBG = uv.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

// Make sure this parameter matches the "distanceRange" used when generating these fonts (found in:
// @here/map-theme/scripts/create-font-catalog.js).
#define SDF_DISTANCE_RANGE 8.0

uniform sampler2D texture;
uniform float textureSize;

#if BG_TEXT
uniform vec3 bgColor;
uniform float bgFactor;
uniform float bgAlpha;
#endif

varying vec4 vColor;
varying vec4 vUv;
varying float vWeight;
varying float vBG;

void main() {

    vec4 color = vec4(vColor);
    vec3 sample = texture2D(texture, vUv.xy).rgb;

    float h = sqrt(vUv.z * vUv.z + vUv.w * vUv.w);
    float textScale = max(abs(vUv.z / h), 0.000001);
    float dx = abs(dFdx( vUv.x ) * textureSize);
    float dy = abs(dFdy( vUv.y ) * textureSize);
    // Special case for glyphs perfectly aligned with the screen Y axis.
    if (dx == 0.0 && dy == 0.0) {
        textScale = 1.0;
        dx = abs(dFdy( vUv.x ) * textureSize);
        dy = abs(dFdx( vUv.y ) * textureSize);
    }
    float toPixels = SDF_DISTANCE_RANGE * inversesqrt( dx * dx + dy * dy ) * textScale;

    float distScale = vWeight;
    float alphaScale = 1.0;
    #if BG_TEXT
    // TODO: Make this less hard-coded with proper outlines specified in pixel width.
    distScale = (1.0 + (bgFactor * (vWeight - 1.0 ))) * bgFactor;
    alphaScale = bgAlpha;
    color.rgb = bgColor;

    float dist = sample.r * distScale - 0.5;
    float alpha = 1.0;
    if (vBG < 1.0) alpha = clamp( dist * toPixels + 0.5, 0.0, alphaScale);
    else alpha = (dist + 0.5) * alphaScale;
    #else
    float dist = sample.r * distScale - 0.5;
    float alpha = clamp( dist * toPixels + 0.5, 0.0, alphaScale);
    #endif
    color.a *= alpha;
    if (color.a < 0.05) {
        discard;
    }

    gl_FragColor = color;
}`;

/**
 * Parameters used when constructing a new [[TextMaterial]].
 */
export interface TextMaterialParameters {
    /**
     * [[GlyphTextureCache]]'s texture object.
     */
    texture: THREE.Texture;
    /**
     * [[GlyphTextureCache]]'s texture size.
     */
    textureSize: number;
    /**
     * Outline thickness. Choose a value in the range `[5.0, 20.0]` to get a simple outline.
     */
    bgFactor?: number;
    /**
     * Outline color value.
     */
    bgColor?: number | string;
    /**
     * Outline alpha value. A value of `0` makes it totally transparent. A value of `1` makes it
     * fully opaque.
     */
    bgAlpha?: number;
}

/**
 * Material designed to render text (using distance-encoded fonts).
 */
export class TextMaterial extends THREE.RawShaderMaterial {
    static DEFAULT_BG_FACTOR: number = 0.0;
    static DEFAULT_BG_COLOR: number = 0xe0e0e0;
    static DEFAULT_BG_ALPHA: number = 1.0;

    /**
     * Constructs a new `TextMaterial`.
     *
     * @param params `TextMaterial` parameters.
     */
    constructor(params: TextMaterialParameters) {
        const shaderParams: THREE.ShaderMaterialParameters = {
            name: "TextMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
            uniforms: {
                texture: new THREE.Uniform(params.texture),
                textureSize: new THREE.Uniform(params.textureSize),
                bgFactor: new THREE.Uniform(TextMaterial.DEFAULT_BG_FACTOR),
                bgColor: new THREE.Uniform(new THREE.Color(TextMaterial.DEFAULT_BG_COLOR)),
                bgAlpha: new THREE.Uniform(TextMaterial.DEFAULT_BG_ALPHA)
            },
            defines: { BG_TEXT: 0 },
            depthTest: true,
            depthWrite: true,
            side: THREE.DoubleSide,
            transparent: true
        };
        super(shaderParams);
        this.extensions.derivatives = true;

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.bgColor !== undefined) {
                this.bgColor.set(params.bgColor as any);
            }
            if (params.bgFactor !== undefined) {
                this.bgFactor = params.bgFactor;
            }
            if (params.bgAlpha !== undefined) {
                this.bgAlpha = params.bgAlpha;
            }
        }
    }

    /**
     * Outline thickness. Choose a value in the range `[5.0, 20.0]` to get a simple outline.
     */
    get bgFactor(): number {
        return this.uniforms.bgFactor.value as number;
    }
    set bgFactor(value: number) {
        this.uniforms.bgFactor.value = value;
        this.updateBackgroundFeature();
    }

    /**
     * Outline color value.
     */
    get bgColor(): THREE.Color {
        return this.uniforms.bgColor.value as THREE.Color;
    }
    set bgColor(value: THREE.Color) {
        this.uniforms.bgColor.value = value;
    }

    /**
     * Outline alpha value. A value of `0` makes it totally transparent. A value of `1` makes it
     * fully opaque.
     */
    get bgAlpha(): number {
        return this.uniforms.bgAlpha.value as number;
    }
    set bgAlpha(value: number) {
        this.uniforms.bgAlpha.value = value;
    }

    private updateBackgroundFeature(): void {
        this.defines.BG_TEXT = this.bgFactor > 0.0 ? 1 : 0;
    }
}
