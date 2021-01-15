/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts webgl1-compatible vertex shader glsl code to webgl2.
 *
 * @param vertexShader - String containing the vertex shader glsl code.
 * @returns the converted glsl code.
 */
export function convertVertexShaderToWebGL2(vertexShader: string): string {
    return (
        ["#define attribute in", "#define varying out", "#define texture2D texture"].join("\n") +
        "\n" +
        vertexShader
    );
}

/**
 * Converts webgl1-compatible fragment shader glsl code to webgl2.
 *
 * @param fragmentShader - String containing the fragment shader glsl code.
 * @returns the converted glsl code.
 */
export function convertFragmentShaderToWebGL2(fragmentShader: string): string {
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
