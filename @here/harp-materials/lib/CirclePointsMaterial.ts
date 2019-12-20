/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";
import { enforceBlending } from "./Utils";

const vertexShader: string = `
uniform float size;

void main() {
    vec3 transformed = vec3(position);
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = size;
}
`;

const fragmentShader: string = `
uniform vec3 diffuse;

void main() {
    float alpha = 1.0;

    float radius = 0.5;
    vec2 coords = gl_PointCoord.xy - vec2(0.5);
    float len = length(coords);
    float falloff = fwidth(len);
    float threshold = 1.0 - smoothstep(radius - falloff, radius, len);
    alpha *= threshold;

    gl_FragColor = vec4(diffuse, alpha);
}`;

/**
 * Parameters used when constructing a new [[HighPrecisionPointMaterial]].
 */
export interface CirclePointsMaterialParameters extends THREE.ShaderMaterialParameters {
    /**
     * Point size.
     */
    size?: number;
}

const DEFAULT_CIRCLE_SIZE = 1;

/**
 * Material designed to render circle points. Note that it is always transparent since the circle
 * shape is created with an alpha channel to benefit an antialising that a mere `discard` could
 * not bring.
 */
export class CirclePointsMaterial extends THREE.ShaderMaterial {
    isCirclePointsMaterial: true;
    uniforms: { [uniform: string]: THREE.IUniform };
    vertexShader: string;
    fragmentShader: string;

    private m_size: number;
    private m_color: THREE.Color;

    /**
     * Constructs a new `CirclePointsMaterial`.
     *
     * @param parameters The constructor's parameters.
     */
    constructor(parameters: CirclePointsMaterialParameters = {}) {
        parameters.depthTest = false;
        enforceBlending(parameters);

        super(parameters);

        this.isCirclePointsMaterial = true;
        this.type = "CirclePointsMaterial";
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;

        this.m_size = parameters.size || DEFAULT_CIRCLE_SIZE;
        this.m_color = new THREE.Color();

        this.uniforms = {
            diffuse: new THREE.Uniform(this.m_color),
            size: new THREE.Uniform(this.m_size)
        };

        this.extensions.derivatives = true;
    }

    /**
     * Gets the circle screen size.
     */
    get size(): number {
        return this.m_size;
    }

    /**
     * Sets the circle screen size.
     */
    set size(size: number) {
        this.m_size = size;
        this.uniforms.size.value = size;
        this.needsUpdate = true;
    }

    /**
     * Gets the diffuse.
     */
    get color(): string {
        return "#" + this.m_color.getHexString();
    }

    /**
     * Sets the diffuse.
     */
    set color(color: string) {
        this.m_color.set(color);
        this.uniforms.diffuse.value.set(this.m_color);
        this.needsUpdate = true;
    }
}
