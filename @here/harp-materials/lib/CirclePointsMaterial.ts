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
import { enforceBlending } from "./Utils";

const vertexShader: string = `
uniform float size;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

attribute vec3 position;

void main() {
    vec3 transformed = vec3(position);
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = size;
}
`;

const fragmentShader: string = `
precision highp float;
precision highp int;

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
export interface CirclePointsMaterialParameters
    extends THREE.ShaderMaterialParameters,
        RendererMaterialParameters {
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

    /**
     * Constructs a new `CirclePointsMaterial`.
     *
     * @param parameters - The constructor's parameters. Always required except when cloning another
     */
    constructor(parameters?: CirclePointsMaterialParameters) {
        const defaultColor = new THREE.Color();
        const defaultOpacity = 1.0;
        let sizeValue, colorValue, opacityValue;
        let shaderParameters: RawShaderMaterialParameters | undefined;
        if (parameters) {
            const { size, color, opacity, ...shaderParams } = parameters;
            sizeValue = size;
            colorValue = color;
            opacityValue = opacity;

            shaderParams.name = "CirclePointsMaterial";
            shaderParams.vertexShader = vertexShader;
            shaderParams.fragmentShader = fragmentShader;
            shaderParams.uniforms = THREE.UniformsUtils.merge([
                {
                    size: new THREE.Uniform(CirclePointsMaterial.DEFAULT_CIRCLE_SIZE),
                    diffuse: new THREE.Uniform(defaultColor),
                    opacity: new THREE.Uniform(defaultOpacity)
                },
                THREE.UniformsLib.fog
            ]);
            shaderParams.depthTest = false;
            shaderParams.extensions = {
                ...shaderParams.extensions,
                derivatives: true
            };
            shaderParameters = shaderParams;
        }
        super(shaderParameters);

        // Blending needs to always be enabled to support smooth edges
        enforceBlending(this);

        this.type = "CirclePointsMaterial";
        this.setOpacity(defaultOpacity);

        if (sizeValue !== undefined) {
            this.size = sizeValue;
        }
        if (colorValue !== undefined) {
            this.color = colorValue;
        }
        if (opacityValue !== undefined) {
            this.setOpacity(opacityValue);
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

    get color(): THREE.Color {
        return this.uniforms.diffuse.value as THREE.Color;
    }

    set color(value: THREE.Color) {
        this.uniforms.diffuse.value.copy(value);
    }
}
