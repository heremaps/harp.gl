/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

/**
 * Insert shader includes after another shader include.
 *
 * @param shaderContent Original string.
 * @param shaderName String to append to.
 * @param insertedShaderName String to append after string `shaderA`.
 * @param addTab If `true`, a tab character will be inserted before `shaderB`.
 */
export function insertShaderInclude(
    shaderContent: string,
    shaderName: string,
    insertedShaderName: string,
    addTab?: boolean
): string {
    const tabChar = addTab === true ? "\t" : "";

    const result = shaderContent.replace(
        `#include <${shaderName}>`,
        `#include <${shaderName}>
${tabChar}#include <${insertedShaderName}>`
    );
    return result;
}

/**
 * THREE.js is enabling blending only when transparent is `true` or when a blend mode
 * different than `NormalBlending` is set.
 * Since we don't want to set transparent to true and mess up the render order we set
 * `CustomBlending` with the same parameters as the `NormalBlending`.

 * @param material `Material` that should use blending
 */
export function enforceBlending(material: THREE.Material | THREE.ShaderMaterialParameters) {
    if (material.transparent) {
        // Nothing to do
        return;
    }

    material.blending = THREE.CustomBlending;
    if (material.premultipliedAlpha === true) {
        material.blendSrc = THREE.OneFactor;
        material.blendDst = THREE.OneMinusSrcAlphaFactor;
        material.blendSrcAlpha = THREE.OneFactor;
        material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    } else {
        material.blendSrc = THREE.SrcAlphaFactor;
        material.blendDst = THREE.OneMinusSrcAlphaFactor;
        material.blendSrcAlpha = THREE.OneFactor;
        material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    }
}
