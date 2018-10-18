/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

const vertexSource: string = `
attribute vec4 position;
attribute vec3 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec3 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
}`;

const fragmentSource: string = `
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
    float sample = 0.0;
    if (vUv.z < pageOffset || vUv.z > (pageOffset + 7.0)) discard;
    else if (vUv.z < pageOffset + 1.0) sample = texture2D(page0, vUv.xy).a;
    else if (vUv.z < pageOffset + 2.0) sample = texture2D(page1, vUv.xy).a;
    else if (vUv.z < pageOffset + 3.0) sample = texture2D(page2, vUv.xy).a;
    else if (vUv.z < pageOffset + 4.0) sample = texture2D(page3, vUv.xy).a;
    else if (vUv.z < pageOffset + 5.0) sample = texture2D(page4, vUv.xy).a;
    else if (vUv.z < pageOffset + 6.0) sample = texture2D(page5, vUv.xy).a;
    else if (vUv.z < pageOffset + 7.0) sample = texture2D(page6, vUv.xy).a;
    else sample = texture2D(page7, vUv.xy).a;

    gl_FragColor = vec4(sample, sample, sample, 1.0);
}`;

/**
 * Material designed to copy glyph into a [[GlyphTextureCache]].
 */
export class GlyphCopyMaterial extends THREE.RawShaderMaterial {
    /**
     * Constructs a new `GlyphCopyMaterial`.
     *
     * @param params `GlyphCopyMaterial` parameters.
     */
    constructor() {
        const shaderParams: THREE.ShaderMaterialParameters = {
            name: "GlyphCopyMaterial",
            vertexShader: vertexSource,
            fragmentShader: fragmentSource,
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
            depthWrite: false
        };
        super(shaderParams);
    }
}
