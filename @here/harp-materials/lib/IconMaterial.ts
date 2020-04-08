/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

const vertexSource: string = `
attribute vec4 position;
attribute vec4 color;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec4 vColor;
varying vec2 vUv;

void main() {
    vUv = uv;
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

uniform sampler2D map;

varying vec4 vColor;
varying vec2 vUv;

void main() {

    vec4 color = texture2D(map, vUv.xy);
    color *= vColor.a;
    if (color.a < 0.05) {
        discard;
    }
    gl_FragColor = color;
}`;

/**
 * Parameters used when constructing a new [[IconMaterial]].
 */
export interface IconMaterialParameters {
    /**
     * Texture map.
     */
    map: THREE.Texture;
}

/**
 * 2D material for icons, similar to [[TextMaterial]]. Uses component in texture coordinates to
 * apply opacity.
 */
export class IconMaterial extends THREE.RawShaderMaterial {
    /**
     * Constructs a new `IconMaterial`.
     *
     * @param params `IconMaterial` parameters.
     */
    constructor(params: IconMaterialParameters) {
        const shaderParams: THREE.ShaderMaterialParameters = {
            name: "IconMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
            uniforms: {
                map: new THREE.Uniform(params.map)
            },
            depthTest: true,
            depthWrite: true,
            transparent: true,

            vertexColors: true,
            premultipliedAlpha: true,
            blending: THREE.NormalBlending
        };
        super(shaderParams);
    }

    /**
     * Icon texture map/atlas.
     */
    get map(): THREE.Texture {
        return this.uniforms.map.value;
    }
}
