/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { AdditiveBlending, ShaderMaterial } from "three";
import { CopyShader } from "./CopyShader";

/**
 * The material to use for the quad of the [[MSAARenderPass]] in the composing.
 */
export class MSAAMaterial extends ShaderMaterial {
    /**
     * The constructor of `MSAAMaterial`.
     *
     * @param uniforms The [[CopyShader]]'s uniforms.
     */
    constructor(uniforms: { [uniformName: string]: THREE.IUniform }) {
        super({
            uniforms,
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            premultipliedAlpha: true,
            transparent: true,
            blending: AdditiveBlending,
            depthTest: false,
            depthWrite: false
        });
    }
}
