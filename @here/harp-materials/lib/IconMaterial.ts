/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    RawShaderMaterial,
    RawShaderMaterialParameters,
    RendererMaterialParameters
} from "./RawShaderMaterial";

const vertexSource: string = `
attribute vec4 position;
attribute vec4 color;
attribute vec2 uv;
attribute float stickHeight;
attribute float isStick;
attribute vec3 surfaceNormal;

// uniform mat4 modelViewMatrix;
// uniform mat4 projectionMatrix;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

varying vec4 vColor;
varying float vIsStick;
varying vec2 vUv;

void main() {
    vUv = uv;
    vColor = color;
    vIsStick = isStick;
    vec3 pos = position.xyz;

    // If the vertex belongs to the icon box or to the top of the stick:
    // if (isStick == 0.0 || (isStick == 1.0 && uv[1] == 0.0)) {
        pos += surfaceNormal * 100.0;
    // }
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

uniform sampler2D map;

varying vec4 vColor;
varying float vIsStick;
varying vec2 vUv;

void main() {
    vec4 color = vIsStick > 0.0 ? vec4(1.0, 0.0, 0.0, 1.0) : texture2D(map, vUv.xy);
    color *= vColor;
    if (color.a < 0.05) {
        discard;
    }
    gl_FragColor = color;
}`;

/**
 * Parameters used when constructing a new {@link IconMaterial}.
 */
export interface IconMaterialParameters extends RendererMaterialParameters {
    /**
     * Texture map.
     */
    map: THREE.Texture;
}

/**
 * 2D material for icons, similar to [[TextMaterial]]. Uses component in texture coordinates to
 * apply opacity.
 */
export class IconMaterial extends RawShaderMaterial {
    /**
     * Constructs a new `IconMaterial`.
     *
     * @param params - `IconMaterial` parameters. Always required except when cloning another
     * material.
     */
    constructor(params?: IconMaterialParameters) {
        const shaderParams: RawShaderMaterialParameters | undefined = params
            ? {
                  name: "IconMaterial",
                  vertexShader: vertexSource,
                  fragmentShader: fragmentSource,
                  uniforms: {
                      map: new THREE.Uniform(params.map)
                  },
                  depthTest: true,
                  depthWrite: false,
                  transparent: true,

                  vertexColors: true,
                  premultipliedAlpha: true,
                  rendererCapabilities: params.rendererCapabilities
              }
            : undefined;
        super(shaderParams);
    }

    /**
     * Icon texture map/atlas.
     */
    get map(): THREE.Texture {
        return this.uniforms.map.value;
    }
}
