/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The base shader to use for [[MapView]]'s composing passes, like [[MSAAMaterial]].
 */

export const CopyShader: THREE.Shader = {
    uniforms: {
        tDiffuse: { value: null },
        opacity: { value: 1.0 }
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
    fragmentShader: `
    uniform float opacity;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
        vec4 texel = texture2D( tDiffuse, vUv );
        gl_FragColor = opacity * texel;
    }`
};
