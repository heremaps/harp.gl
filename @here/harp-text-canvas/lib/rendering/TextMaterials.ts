/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { convertFragmentShaderToWebGL2, convertVertexShaderToWebGL2 } from "@here/harp-utils";
import * as THREE from "three";

const SdfShaderChunks = {
    sdf_attributes: `
        attribute vec4 position;
        attribute vec4 uv;
        attribute vec4 color;
        attribute vec4 bgColor;
        `,
    sdf_varying: `
        varying vec4 vColor;
        varying float vWeight;
        varying vec2 vUv;
        varying float vRotation;
        `,
    sdf_varying_computation: `
        #if BG_TEXT
        vColor = bgColor;
        vWeight = uv.w;
        #else
        vColor = color;
        vWeight = uv.z;
        #endif
        vUv = vec2(uv.xy);
        vRotation = position.w;
        `,
    sdf_frag_uniforms: `
        uniform sampler2D sdfTexture;
        uniform vec4 sdfParams;
        `,
    sdf_sampling_functions: `
        float median(float r, float g, float b) {
            return max(min(r, g), min(max(r, g), b));
        }

        float getDistance(vec2 uvOffset) {
            vec3 texSample = texture2D(sdfTexture, vUv.xy + uvOffset).rgb;
            #if MSDF
            return median(texSample.r, texSample.g, texSample.b);
            #else
            return texSample.r;
            #endif
        }

        float getOpacity(vec2 uvOffset, float weight) {
            vec2 uv = vUv + uvOffset;
            vec2 rotatedUVs = abs(vec2(
                cos(vRotation) * uv.x - sin(vRotation) * uv.y,
                sin(vRotation) * uv.x + cos(vRotation) * uv.y));

            float dx = dFdx(rotatedUVs.x) * sdfParams.x;
            float dy = dFdy(rotatedUVs.y) * sdfParams.y;
            float toPixels = sdfParams.w * inversesqrt( dx * dx + dy * dy );

            float dist = getDistance(uvOffset) + min(weight, 0.5 - 1.0 / sdfParams.w) - 0.5;
            return clamp(dist * toPixels + 0.5, 0.0, 1.0);
        }
        `
};
Object.assign(THREE.ShaderChunk, SdfShaderChunks);

const clearVertexSource: string = `
    attribute vec2 position;

    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;

    void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
    }`;

const clearFragmentSource: string = `
    precision highp float;
    precision highp int;

    void main() {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }`;

const copyVertexSource: string = `
    attribute vec3 position;
    attribute vec2 uv;

    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;

    varying vec3 vUv;

    void main() {
        vUv = vec3(uv.xy, position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
    }`;

const copyFragmentSource: string = `
    precision highp float;
    precision highp int;

    uniform float pageOffset;
    uniform sampler2D page0;
    uniform sampler2D page1;
    uniform sampler2D page2;
    uniform sampler2D page3;
    uniform sampler2D page4;
    uniform sampler2D page5;
    uniform sampler2D page6;
    uniform sampler2D page7;

    varying vec3 vUv;

    void main() {
        vec4 texSample = vec4(0.0);
        if (vUv.z < pageOffset || vUv.z > (pageOffset + 7.0)) discard;
        else if (vUv.z < pageOffset + 1.0) texSample = texture2D(page0, vUv.xy);
        else if (vUv.z < pageOffset + 2.0) texSample = texture2D(page1, vUv.xy);
        else if (vUv.z < pageOffset + 3.0) texSample = texture2D(page2, vUv.xy);
        else if (vUv.z < pageOffset + 4.0) texSample = texture2D(page3, vUv.xy);
        else if (vUv.z < pageOffset + 5.0) texSample = texture2D(page4, vUv.xy);
        else if (vUv.z < pageOffset + 6.0) texSample = texture2D(page5, vUv.xy);
        else if (vUv.z < pageOffset + 7.0) texSample = texture2D(page6, vUv.xy);
        else texSample = texture2D(page7, vUv.xy);

        gl_FragColor = texSample;
    }`;

const sdfTextVertexSource: string = `
    #include <sdf_attributes>
    #include <sdf_varying>

    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;

    void main() {
        #include <sdf_varying_computation>
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
    }`;

const sdfTextFragmentSource: string = `
    precision highp float;
    precision highp int;

    #include <sdf_varying>
    #include <sdf_frag_uniforms>
    #include <sdf_sampling_functions>

    void main() {
        vec4 color = vColor;
        color.a *= getOpacity(vec2(0.0), vWeight);
        if (color.a < 0.05) {
            discard;
        }
        gl_FragColor = color;
    }`;

interface RendererMaterialParameters {
    rendererCapabilities: THREE.WebGLCapabilities;
}

interface RawShaderMaterialParameters extends THREE.ShaderMaterialParameters {
    rendererCapabilities: THREE.WebGLCapabilities;
}

class RawShaderMaterial extends THREE.RawShaderMaterial {
    /**
     * The constructor of `RawShaderMaterial`.
     *
     * @param params - `RawShaderMaterial` parameters.  Always required except when cloning
     * another material.
     */
    constructor(params?: RawShaderMaterialParameters) {
        const isWebGL2 = params?.rendererCapabilities.isWebGL2 === true;

        const shaderParams: THREE.ShaderMaterialParameters | undefined = params
            ? {
                  ...params,
                  glslVersion: isWebGL2 ? THREE.GLSL3 : THREE.GLSL1,
                  vertexShader:
                      isWebGL2 && params.vertexShader
                          ? convertVertexShaderToWebGL2(params.vertexShader)
                          : params.vertexShader,
                  fragmentShader:
                      isWebGL2 && params.fragmentShader
                          ? convertFragmentShaderToWebGL2(params.fragmentShader)
                          : params.fragmentShader
              }
            : undefined;
        // Remove properties that are not in THREE.ShaderMaterialParameters, otherwise THREE.js
        // will log warnings.
        if (shaderParams) {
            delete (shaderParams as any).rendererCapabilities;
        }
        super(shaderParams);
    }
}

/**
 * @hidden
 * Material used for clearing glyphs from a [[GlyphTextureCache]].
 */
export class GlyphClearMaterial extends RawShaderMaterial {
    /**
     * Creates a new `GlyphClearMaterial`.
     * @param params - Material parameters. Always required except when cloning another
     * material.
     * @returns New `GlyphClearMaterial`.
     */
    constructor(params?: RendererMaterialParameters) {
        const shaderParams: RawShaderMaterialParameters | undefined = params
            ? {
                  name: "GlyphClearMaterial",
                  vertexShader: clearVertexSource,
                  fragmentShader: clearFragmentSource,
                  uniforms: {},
                  depthTest: false,
                  depthWrite: false,
                  rendererCapabilities: params.rendererCapabilities
              }
            : undefined;
        super(shaderParams);
    }
}

/**
 * @hidden
 * Material used for copying glyphs into a [[GlyphTextureCache]].
 */
export class GlyphCopyMaterial extends RawShaderMaterial {
    /**
     * Creates a new `GlyphCopyMaterial`.
     * @param params - Material parameters. Always required except when cloning another
     * material.
     * @returns New `GlyphCopyMaterial`.
     */
    constructor(params?: RawShaderMaterialParameters) {
        const shaderParams: RawShaderMaterialParameters | undefined = params
            ? {
                  name: "GlyphCopyMaterial",
                  vertexShader: copyVertexSource,
                  fragmentShader: copyFragmentSource,
                  uniforms: {
                      pageOffset: new THREE.Uniform(0.0),
                      page0: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page1: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page2: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page3: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page4: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page5: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page6: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE),
                      page7: new THREE.Uniform(THREE.Texture.DEFAULT_IMAGE)
                  },
                  depthTest: false,
                  depthWrite: false,
                  rendererCapabilities: params.rendererCapabilities
              }
            : undefined;
        super(shaderParams);
    }
}

/**
 * @hidden
 * Material parameters passed on [[SdfTextMaterial]] creation.
 */
export interface SdfTextMaterialParameters extends RendererMaterialParameters {
    texture: THREE.Texture;
    textureSize: THREE.Vector2;
    size: number;
    distanceRange: number;
    isMsdf: boolean;
    isBackground: boolean;
    vertexSource?: string;
    fragmentSource?: string;
}

/**
 * Material designed to render transformable, high quality SDF text.
 */
export class SdfTextMaterial extends RawShaderMaterial {
    /**
     * Creates a new `SdfTextMaterial`.
     *
     * @param params - Material parameters. Always required except when cloning another
     * material.
     * @returns New `SdfTextMaterial`.
     */
    constructor(params?: SdfTextMaterialParameters) {
        const shaderParams: RawShaderMaterialParameters | undefined = params
            ? {
                  name: "SdfTextMaterial",
                  vertexShader:
                      params.vertexSource !== undefined ? params.vertexSource : sdfTextVertexSource,
                  fragmentShader:
                      params.fragmentSource !== undefined
                          ? params.fragmentSource
                          : sdfTextFragmentSource,
                  uniforms: {
                      sdfTexture: new THREE.Uniform(params.texture),
                      sdfParams: new THREE.Uniform(
                          new THREE.Vector4(
                              params.textureSize.x,
                              params.textureSize.y,
                              params.size,
                              params.distanceRange
                          )
                      )
                  },
                  defines: {
                      MSDF: params.isMsdf ? 1.0 : 0.0,
                      BG_TEXT: params.isBackground ? 1.0 : 0.0
                  },
                  depthTest: true,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                  transparent: true,
                  rendererCapabilities: params.rendererCapabilities
              }
            : undefined;
        super(shaderParams);
        this.extensions.derivatives = true;
    }
}
