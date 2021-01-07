/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { RawShaderMaterial, RawShaderMaterialParameters } from "./RawShaderMaterial";
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
uniform float opacity;

void main() {
    float alpha = opacity;

    float radius = 0.5;
    vec2 coords = gl_PointCoord.xy - vec2(0.5);
    float len = length(coords);
    float falloff = fwidth(len);
    float threshold = 1.0 - smoothstep(radius - falloff, radius, len);
    alpha *= threshold;

    gl_FragColor = vec4(diffuse, alpha);
}`;

/**
 * Parameters used when constructing a new {@link HighPrecisionPointMaterial}.
 */
export interface CirclePointsMaterialParameters extends RawShaderMaterialParameters {
    /**
     * Point size.
     */
    size?: number;

    /**
     * Point color.
     */
    color?: THREE.Color;
}

/**
 * Material designed to render circle points. Note that it is always transparent since the circle
 * shape is created with an alpha channel to benefit an antialising that a mere `discard` could
 * not bring.
 */
export class CirclePointsMaterial extends RawShaderMaterial {
    static readonly DEFAULT_CIRCLE_SIZE = 1;

    private readonly m_color: THREE.Color;

    /**
     * Constructs a new `CirclePointsMaterial`.
     *
     * @param parameters - The constructor's parameters.
     */
    constructor(parameters: CirclePointsMaterialParameters = {}) {
        const { size, color, opacity, ...shaderParams } = parameters;
        shaderParams.name = "CirclePointsMaterial";
        shaderParams.vertexShader = vertexShader;
        shaderParams.fragmentShader = fragmentShader;
        shaderParams.uniforms = {
            size: new THREE.Uniform(CirclePointsMaterial.DEFAULT_CIRCLE_SIZE),
            diffuse: new THREE.Uniform(new THREE.Color()),
            opacity: new THREE.Uniform(1.0)
        };
        shaderParams.depthTest = false;
        shaderParams.extensions = {
            ...shaderParams.extensions,
            derivatives: true
        };

        super(shaderParams);
        // Blending needs to always be enabled to support smooth edges
        enforceBlending(this);

        this.type = "CirclePointsMaterial";
        this.m_color = this.uniforms.diffuse.value;
        this.setOpacity(this.uniforms.opacity.value);

        if (size !== undefined) {
            this.size = size;
        }
        if (color !== undefined) {
            this.color = color;
        }
        if (opacity !== undefined) {
            this.setOpacity(opacity);
        }
    }

    /**
     * Gets the circle screen size.
     */
    get size(): number {
        return this.uniforms.size.value;
    }

    /**
     * Sets the circle screen size.
     */
    set size(size: number) {
        this.uniforms.size.value = size;
    }

    setOpacity(opacity: number) {
        this.opacity = opacity;
        // Base constructor may set opacity before uniform being created:
        if (this.uniforms && this.uniforms.opacity) {
            this.uniforms.opacity.value = opacity;
        }
    }

    /**
     * Gets the diffuse.
     */
    get color(): THREE.Color {
        return this.m_color;
    }

    /**
     * Sets the diffuse.
     */
    set color(color: THREE.Color) {
        this.m_color.set(color);
    }
}
