/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

import { CopyShader } from "./CopyMaterial";

/**
 * The material to use for the quad of the {@link @here/harp-mapview#MSAARenderPass}
 * in the composing.
 */
export class MSAAMaterial extends THREE.ShaderMaterial {
    /**
     * The constructor of `MSAAMaterial`.
     *
     * @param uniforms - The [[CopyShader]]'s uniforms.
     */
    constructor(uniforms: { [uniformName: string]: THREE.IUniform }) {
        super({
            uniforms,
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            premultipliedAlpha: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
        });
    }
}
