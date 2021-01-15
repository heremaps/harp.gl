/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { convertFragmentShaderToWebGL2, convertVertexShaderToWebGL2 } from "@here/harp-utils";
import * as THREE from "three";

import { getShaderMaterialDefine, setShaderMaterialDefine } from "./Utils";

/**
 * [[RawShaderMaterial]] parameters.
 */
export interface RendererMaterialParameters {
    rendererCapabilities: THREE.WebGLCapabilities;
}

export interface RawShaderMaterialParameters
    extends RendererMaterialParameters,
        THREE.ShaderMaterialParameters {}

/**
 * Base class for all raw shader materials. Ensures WebGL2 compatibility for WebGL1 shaders.
 */
export class RawShaderMaterial extends THREE.RawShaderMaterial {
    /**
     * The constructor of `RawShaderMaterial`.
     *
     * @param params - `RawShaderMaterial` parameters.  Always required except when cloning
     * another material.
     */
    constructor(params?: RawShaderMaterialParameters) {
        const isWebGL2 = params?.rendererCapabilities.isWebGL2 === true;

        const shaderParams: THREE.ShaderMaterialParameters | undefined = params
            ? {
                  ...params,
                  glslVersion: isWebGL2 ? THREE.GLSL3 : THREE.GLSL1,
                  vertexShader:
                      isWebGL2 && params.vertexShader
                          ? convertVertexShaderToWebGL2(params.vertexShader)
                          : params.vertexShader,
                  fragmentShader:
                      isWebGL2 && params.fragmentShader
                          ? convertFragmentShaderToWebGL2(params.fragmentShader)
                          : params.fragmentShader
              }
            : undefined;
        // Remove properties that are not in THREE.ShaderMaterialParameters, otherwise THREE.js
        // will log warnings.
        if (shaderParams) {
            delete (shaderParams as any).rendererCapabilities;
        }
        super(shaderParams);
        this.invalidateFog();
        this.setOpacity(shaderParams?.opacity);
    }

    invalidateFog() {
        if (this.defines !== undefined && this.fog !== getShaderMaterialDefine(this, "USE_FOG")) {
            setShaderMaterialDefine(this, "USE_FOG", this.fog);
        }
    }

    /**
     * To set the material's opacity property value and also update the opacity value of the uniforms if needed.
     * @param opacity If undefined, the value is not set
     */
    setOpacity(opacity?: number) {
        if (opacity !== undefined) {
            // The base constructor may set the opacity property before,
            // therefore we don't check unequality of the current and new opacity value:
            this.opacity = opacity;
            if (this.uniforms?.opacity) {
                this.uniforms.opacity.value = opacity;
            }
        }
    }
}
