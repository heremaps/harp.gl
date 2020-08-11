/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

function convertVertexShaderToWebGL2(vertexShader: string): string {
    return (
        ["#define attribute in", "#define varying out", "#define texture2D texture"].join("\n") +
        "\n" +
        vertexShader
    );
}

function convertFragmentShaderToWebGL2(fragmentShader: string): string {
    return (
        [
            "#define varying in",
            "out highp vec4 pc_fragColor;",
            "#define gl_FragColor pc_fragColor",
            "#define gl_FragDepthEXT gl_FragDepth",
            "#define texture2D texture",
            "#define textureCube texture",
            "#define texture2DProj textureProj",
            "#define texture2DLodEXT textureLod",
            "#define texture2DProjLodEXT textureProjLod",
            "#define textureCubeLodEXT textureLod",
            "#define texture2DGradEXT textureGrad",
            "#define texture2DProjGradEXT textureProjGrad",
            "#define textureCubeGradEXT textureGrad"
        ].join("\n") +
        "\n" +
        fragmentShader
    );
}

/**
 * Material that converts webgl1 shaders to webgl2 compatible code when renderer uses a WebGL2
 * context.
 */
export class WebGL1RawShaderMaterial extends THREE.RawShaderMaterial {
    /**
     * The constructor of `WebGL1RawShaderMaterial`.
     *
     * @param params - Optional material parameters.
     */
    // tslint:disable-next-line: deprecation
    constructor(params?: THREE.ShaderMaterialParameters) {
        super(params);
    }

    // overrides with THREE.js base classes are not recognized by tslint.
    // tslint:disable-next-line: explicit-override
    onBeforeCompile(shader: THREE.Shader, renderer: THREE.WebGLRenderer) {
        if (renderer.capabilities.isWebGL2) {
            shader.vertexShader = convertVertexShaderToWebGL2(shader.vertexShader);
            shader.fragmentShader = convertFragmentShaderToWebGL2(shader.fragmentShader);
        }
    }
}
