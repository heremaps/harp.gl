/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { convertFragmentShaderToWebGL2, convertVertexShaderToWebGL2 } from "@here/harp-utils";
import * as THREE from "three";

/**
 * Material that converts webgl1 shaders to webgl2 compatible code when renderer uses a WebGL2
 * context.
 */
export class RawShaderMaterial extends THREE.RawShaderMaterial {
    /**
     * The constructor of `WebGL1RawShaderMaterial`.
     *
     * @param params - Optional material parameters.
     */
    constructor(params?: THREE.ShaderMaterialParameters) {
        super(params);
    }

    // overrides with THREE.js base classes are not recognized by tslint.
    onBeforeCompile(shader: THREE.Shader, renderer: THREE.WebGLRenderer) {
        if (renderer.capabilities.isWebGL2) {
            shader.vertexShader = convertVertexShaderToWebGL2(shader.vertexShader);
            shader.fragmentShader = convertFragmentShaderToWebGL2(shader.fragmentShader);
        }
    }
}
