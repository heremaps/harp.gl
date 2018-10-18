/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
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
