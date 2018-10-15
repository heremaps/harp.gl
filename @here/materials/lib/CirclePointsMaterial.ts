/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { Color, ShaderMaterial, Uniform } from "three";

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
 * Material designed to render circle points.
 */
export class CirclePointsMaterial extends ShaderMaterial {
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

        super(parameters);

        this.isCirclePointsMaterial = true;
        this.type = "CirclePointsMaterial";
        this.vertexShader = vertexShader;
        this.fragmentShader = fragmentShader;

        this.m_size = parameters.size || DEFAULT_CIRCLE_SIZE;
        this.m_color = new Color();

        this.uniforms = {
            diffuse: new Uniform(this.m_color),
            size: new Uniform(this.m_size)
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
