/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "@here/harp-utils";
import * as THREE from "three";

/**
 * Values for boolean shader defines
 */
export const DEFINE_BOOL_TRUE = "";
export const DEFINE_BOOL_FALSE = undefined;

/**
 * Insert shader includes after another shader include.
 *
 * @param shaderContent - Original string.
 * @param shaderName - String to append to.
 * @param insertedShaderName - String to append after string `shaderA`.
 * @param addTab - If `true`, a tab character will be inserted before `shaderB`.
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

export interface ForcedBlending {
    /**
     * This material has `blending` always enabled regardless of `opacity` setting.s
     */
    forcedBlending?: true;
}

/**
 * THREE.js is enabling blending only when transparent is `true` or when a blend mode
 * different than `NormalBlending` is set.
 * Since we don't want to set transparent to true and mess up the render order we set
 * `CustomBlending` with the same parameters as the `NormalBlending`.

 * @param material - `Material` that should use blending
 * @note This function should not be used in frame update after material has been passed to WebGL.
 * In such cases use [[enableBlending]] instead.
 */
export function enforceBlending(
    material: (THREE.Material | THREE.ShaderMaterialParameters) & ForcedBlending
) {
    if (material.transparent) {
        // Nothing to do
        return;
    }

    enableBlending(material);
    material.forcedBlending = true;
}

/**
 * Enable alpha blending using THREE.CustomBlending setup.
 *
 * Function enables blending using one of predefined modes, for both color and alpha components:
 * - Src: [[THREE.SrcAlphaFactor]], Dst: [[THREE.OneMinusSrcAlphaFactor]]
 * - Src: [[THREE.OneFactor]], Dst: [[THREE.OneMinusSrcAlphaFactor]]
 * The second blending equation is used when [[THREE.Material.premultipliedAlpha]] is enabled
 * for this material.
 * @note Blending mode change does not require material update.
 * @see THREE.Material.needsUpdate.
 * @param material - The material or material parameters to modify.
 */
export function enableBlending(
    material: (THREE.Material | THREE.ShaderMaterialParameters) & ForcedBlending
) {
    if (material.transparent === true || material.forcedBlending === true) {
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

/**
 * Disable alpha blending using THREE.CustomBlending mode, switches to [[THREE.NormalBlending]].
 *
 * @note Blending mode change does not require material update.
 * @see THREE.Material.needsUpdate.
 * @see enableBlending.
 * @param material - The material or material parameters to modify.
 */
export function disableBlending(
    material: (THREE.Material | THREE.ShaderMaterialParameters) & ForcedBlending
) {
    if (material.transparent === true || material.forcedBlending === true) {
        // Nothing to do
        return;
    }

    material.blending = THREE.NormalBlending;
}

/**
 * Setup material shader _define_ using two allowable semantics.
 *
 * Function accepts two types of values for shader preprocessor _define_:
 * - [[boolean]], simple [[true]] or [[false]] which causes _define_ to be set with empty string,
 * such defines may be handled in the shader using __#ifdef__ semantics:
 * ```
 * #ifdef SOME_DEFINE && !defined(OTHER_DEFINE)
 * // do something
 * #endif
 * ```
 *
 * - [[number]] which sets _define_ to explicit value. You may use it to enable/disable some
 * code or even set compile time constants affecting shaders math:
 * ```
 * #if SOME_DEFINE_SWITCH && OTHER_DEFINE_SWITCH == 0
 * gl_FragColor = vec4(1, 1, 1, DEFINE_ALPHA)
 * #endif
 * ```
 * @note Setting _define_ with `false` value is not the same as setting is with number value of `0`.
 *
 * @param material - The [[THREE.ShaderMaterial]] which shader _define_ will be set.
 * @param key - Name of shader _define_ as used in shader, i.e. `USE_FOG`, `COLOR_ALPHA`, etc.
 * @param value - The value to be set as number or boolean specifying if preprocessor define
 * should be defined or not.
 * @returns [[true]] if material has been forced to update (re-compile) due to define changes,
 * return [[false]] whenever define has not been changed.
 */
export function setShaderMaterialDefine(
    material: THREE.ShaderMaterial,
    key: string,
    value: boolean | number
): boolean {
    assert(
        material.defines !== undefined,
        "Do not use this function in ShaderMaterial derived c-tor."
    );
    const semanticValue = getShaderMaterialDefine(material, key);
    const needsUpdate = value !== semanticValue;
    // Nothing to change - early exit
    if (!needsUpdate) {
        return false;
    }
    setShaderDefine(material.defines, key, value);
    material.needsUpdate = needsUpdate;
    return true;
}

/**
 * Acquire value of [[THREE.ShaderMaterial]] GPU shader preprocessor define.
 *
 * The semantic used in entire engine assumes that preprocessor defines may have only binary
 * (defined / not defined) or numerical values, this ensures consistency in the shaders and
 * materials code.
 * @note If _define_ with [[key]] is _undefined_ function returns [[false]], if defined but
 * not numerical value it returns [[true]], otherwise returns number.
 * @see setShaderMaterialDefine.
 *
 * @param material - The material which shader defines are accessed.
 * @param key - The _define_ name (identifier).
 * @param fallbackValue - The value returned when material `defines` are not initialized yet,
 * specified by default as [[false]], provide your own default if you expect numeric value.
 */
export function getShaderMaterialDefine(
    material: THREE.ShaderMaterial,
    key: string,
    fallbackValue: boolean | number = false
): boolean | number {
    if (material.defines === undefined) {
        return fallbackValue;
    }
    return getShaderDefine(material.defines, key);
}

/**
 * Sets new value of 'define' regardless of current value set.
 *
 * Update `defines` map with new key and value, if key is already occupied it overrides its value.
 * Helper function that may be used to setup [[THREE.ShaderMaterialParameters]] before
 * material is create (i.e. in c-tor).
 *
 * @param defines - Shader `defines` stored in key-value map.
 * @param key - The key used to identify _define_.
 * @param value - The value to be stored.
 * @returns [[true]] if define has actually changed, false is stayed the same.
 * @see setShaderMaterialDefine.
 */
export function setShaderDefine(
    defines: { [key: string]: any },
    key: string,
    value: boolean | number
): boolean {
    let updated = false;
    if (typeof value === "number") {
        updated = defines[key] !== value;
        defines[key] = value;
    } else if (value === true) {
        updated = defines[key] !== DEFINE_BOOL_TRUE;
        defines[key] = DEFINE_BOOL_TRUE;
    } else if (value === false && defines[key] !== undefined) {
        // Sets to DEFINE_BOOL_FALSE === undefined
        delete defines[key];
        updated = true;
    }
    return updated;
}

/**
 * Acquire shader 'define' value from `defines` map.
 *
 * If there is no value under [[key]] specified, function returns false, otherwise result is
 * true or numeric value if there is a number stored.
 * @param defines - The `defines` map.
 * @param key - The identifier of the _define_.
 */
export function getShaderDefine(defines: { [key: string]: any }, key: string): boolean | number {
    const currentValue = defines[key];
    const semanticValue =
        currentValue === DEFINE_BOOL_FALSE
            ? false
            : currentValue === DEFINE_BOOL_TRUE
            ? true
            : currentValue;
    return semanticValue;
}
