/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { applyMixinsWithoutProperties, assert, chainCallbacks } from "@here/harp-utils";
import { insertShaderInclude, setShaderDefine } from "./Utils";

import * as THREE from "three";

import { ExtrusionFeatureDefs } from "./MapMeshMaterialsDefs";
import extrusionShaderChunk from "./ShaderChunks/ExtrusionChunks";
import fadingShaderChunk from "./ShaderChunks/FadingChunks";

/**
 * The MapMeshMaterials [[MapMeshBasicMaterial]] and [[MapMeshStandardMaterial]] are the standard
 * [[THREE.MeshBasicMaterial]] and [[THREE.MeshStandardMaterial]], with the addition functionality
 * of fading out the geometry between a fadeNear and fadeFar value.
 *
 * The implementation is designed around a mixin class [[FadingFeatureMixin]], which requires
 * a bit of care when adding the FadingFeature to the existing mesh classes, but it is safe to use
 * and also reduces code duplication.
 */

/**
 * Parameters used when constructing a new implementor of [[FadingFeature]].
 */
export interface FadingFeatureParameters {
    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects start fading out.
     */
    fadeNear?: number;

    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects are transparent.
     */
    fadeFar?: number;
}

/**
 * Parameters used when constructing a new implementor of [[ExtrusionFeature]].
 */
export interface ExtrusionFeatureParameters {
    /**
     * Ratio of the extruded objects, where `1.0` is the default value
     */
    extrusionRatio?: number;
}

/**
 * Parameters used when constructing a new implementor of [[DisplacementFeature]].
 */
export interface DisplacementFeatureParameters {
    /**
     * Texture used for vertex displacement along their normals.
     */
    displacementMap?: THREE.Texture;
}

/**
 * Used internally.
 *
 * @hidden
 */
interface UniformsType {
    [index: string]: THREE.IUniform;
}

/**
 * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
 * [0..maxVisibilityRange].
 *
 * Copy from MapViewUtils, since it cannot be accessed here because of circular dependencies.
 *
 * @param distance Distance from the camera (range: [0, 1]).
 * @param visibilityRange object describing maximum and minimum visibility range - distances
 * from camera at which objects won't be rendered anymore.
 */
function cameraToWorldDistance(distance: number, visibilityRange: ViewRanges): number {
    return distance * visibilityRange.maximum;
}

/**
 * Material properties used from THREE, which may not be defined in the type.
 */
export interface HiddenThreeJSMaterialProperties {
    /**
     * Informs THREE.js to re-compile material shader (due to change in code or defines).
     */
    needsUpdate?: boolean;

    /**
     * Hidden ThreeJS value that is made public here. Required to add new uniforms to subclasses of
     * [[THREE.MeshBasicMaterial]]/[[THREE.MeshStandardMaterial]], basically all materials that are
     * not THREE.ShaderMaterial.
     * @deprecated
     */
    uniformsNeedUpdate?: boolean;

    /**
     * Available in all materials in ThreeJS.
     */
    transparent?: boolean;

    /**
     * Used internally for material shader defines.
     */
    defines?: any;

    /**
     * Used internally for shader uniforms, holds references to material internal shader.uniforms.
     *
     * Holds a reference to material's internal shader uniforms map. New custom feature based
     * uniforms are injected using this reference, but also internal THREE.js shader uniforms
     * will be available via this map after [[Material#onBeforeCompile]] callback is run with
     * feature enabled.
     * @see needsUpdate
     */
    shaderUniforms?: UniformsType;
}

/**
 * Base interface for all objects that should fade in the distance. The implementation of the actual
 * FadingFeature is done with the help of the mixin class [[FadingFeatureMixin]] and a set of
 * supporting functions in the namespace of the same name.
 */
export interface FadingFeature extends HiddenThreeJSMaterialProperties {
    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects start fading out.
     */
    fadeNear?: number;

    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects are transparent. A value
     * of <= 0.0 disables fading.
     */
    fadeFar?: number;
}

/**
 * Base interface for all objects that should have animated extrusion effect. The implementation of
 * the actual ExtrusionFeature is done with the help of the mixin class [[ExtrusionFeatureMixin]]
 * and a set of supporting functions in the namespace of the same name.
 */
export interface ExtrusionFeature extends HiddenThreeJSMaterialProperties {
    /**
     * Ratio of the extruded objects, where `1.0` is the default value. Minimum suggested value
     * is `0.01`
     */
    extrusionRatio?: number;
}

export type DisplacementFeature = HiddenThreeJSMaterialProperties & DisplacementFeatureParameters;

export namespace DisplacementFeature {
    /**
     * Checks if feature is enabled (displacement map defined).
     *
     * @param displacementMaterial
     */
    export function isEnabled(displacementMaterial: DisplacementFeature) {
        return displacementMaterial.displacementMap !== undefined;
    }

    /**
     * Update the internals of the `DisplacementFeature` depending on the value of
     * [[displacementMap]].
     *
     * @param displacementMaterial DisplacementFeature
     */
    export function updateDisplacementFeature(displacementMaterial: DisplacementFeature): void {
        assert(displacementMaterial.defines !== undefined);
        assert(displacementMaterial.shaderUniforms !== undefined);

        const useDisplacementMap = isEnabled(displacementMaterial);
        // Whenever displacement feature state changes (between enabled/disabled) material will be
        // re-compiled, forcing new shader chunks to be added (or removed).
        displacementMaterial.needsUpdate = setShaderDefine(
            displacementMaterial.defines,
            "USE_DISPLACEMENTMAP",
            useDisplacementMap
        );

        // Update texture after change.
        if (useDisplacementMap) {
            const texture = displacementMaterial.displacementMap!;
            texture.needsUpdate = true;
            // Update shader uniform value if already set in onBeforeCompile, otherwise will be set
            // there after shader re-compilation.
            if (displacementMaterial.shaderUniforms!.displacementMap !== undefined) {
                displacementMaterial.shaderUniforms!.displacementMap.value = texture;
            }
        }
    }

    /**
     * This function should be called on implementors of DisplacementFeature in the
     * `onBeforeCompile` callback of that material. It adds the required code to the shaders to
     * apply displacement maps.
     *
     * @param displacementMaterial Material to add uniforms to.
     * @param shader [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(
        displacementMaterial: DisplacementFeature,
        shader: THREE.Shader
    ) {
        if (DisplacementFeature.isEnabled(displacementMaterial)) {
            return;
        }
        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are required for this material, we set one working as a flag,
        // which enables/disables some chunks of shader code.

        // Create the uniforms for the shader (if not already existing), assign default and
        // current feature values to them:
        const uniforms = shader.uniforms as UniformsType;
        uniforms.displacementMap = { value: displacementMaterial.displacementMap };
        uniforms.displacementScale = { value: 1 };
        uniforms.displacementBias = { value: 0 };

        // Only displacementMap uniform will be controlled via DisplacementFeature,
        // but we setup uniforms map reference to all shader uniforms.
        displacementMaterial.shaderUniforms = uniforms;

        // Append the displacement map chunk to the vertex shader.
        shader.vertexShader = shader.vertexShader.replace(
            "#include <skinbase_vertex>",
            `#include <skinbase_vertex>
#ifndef USE_ENVMAP
            vec3 objectNormal = vec3( normal );
#endif`
        );
        shader.vertexShader = insertShaderInclude(
            shader.vertexShader,
            "uv2_pars_vertex",
            "displacementmap_pars_vertex"
        );

        shader.vertexShader = insertShaderInclude(
            shader.vertexShader,
            "skinning_vertex",
            "displacementmap_vertex",
            true
        );
    }
}

export class DisplacementFeatureMixin implements DisplacementFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    defines?: any;
    shaderUniforms?: UniformsType;
    private m_displacementMap?: THREE.Texture;

    protected getDisplacementMap(): THREE.Texture | undefined {
        return this.m_displacementMap;
    }

    protected setDisplacementMap(map: THREE.Texture | undefined) {
        if (map !== this.m_displacementMap) {
            this.m_displacementMap = map;
            DisplacementFeature.updateDisplacementFeature(this);
        }
    }

    /**
     * The mixin class should call this method to register the property [[displacementMap]]
     */
    protected addDisplacementProperties(): void {
        Object.defineProperty(this, "displacementMap", {
            get: () => {
                return this.getDisplacementMap();
            },
            set: val => {
                this.setDisplacementMap(val);
            }
        });
    }

    /**
     * Apply the displacementMap value from the parameters to the respective properties.
     */
    protected applyDisplacementParameters(params?: DisplacementFeatureParameters) {
        // Prepare map for shader defines.
        if (this.defines === undefined) {
            this.defines = {};
        }
        // Create uniforms map for holding references of internal shader uniforms.
        if (this.shaderUniforms === undefined) {
            this.shaderUniforms = {};
        }

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.displacementMap !== undefined) {
                this.setDisplacementMap(params.displacementMap);
            }
        }

        const material = this as any;
        material.onBeforeCompile = chainCallbacks(
            material.onBeforeCompile,
            (shader: THREE.Shader) => {
                DisplacementFeature.onBeforeCompile(this, shader);
            }
        );

        // Require material update at least once, because of new shader chunks added.
        this.needsUpdate = DisplacementFeature.isEnabled(this);
    }

    /**
     * Copy displacementMap from other DisplacementFeature.
     *
     * @param source The material to copy property values from.
     */
    protected copyDisplacementParameters(source: DisplacementFeature) {
        this.setDisplacementMap(source.displacementMap);
        return this;
    }
}

/**
 * Namespace with support functions for implementors of `FadingFeature`.
 */
export namespace FadingFeature {
    export const DEFAULT_FADE_NEAR: number = -1.0;
    export const DEFAULT_FADE_FAR: number = -1.0;

    /**
     * Checks if feature is enabled based on feature params.
     *
     * Fading feature will be disabled if fadeFar is undefined or fadeFar <= 0.0.
     * This function is crucial for shader switching (chunks injection), whenever feature state
     * changes between enabled/disabled. Current approach is to keep feature on (once enabled)
     * whenever fading params are reasonable, even if it causes full fade in, no transparency.
     *
     * @param fadingMaterial FadingFeature.
     */
    export function isEnabled(fadingMaterial: FadingFeature) {
        // NOTE: We could also check if full fade is not achieved, then feature could be
        // disabled, but causing material re-compile.
        return (
            fadingMaterial.fadeNear !== undefined &&
            fadingMaterial.fadeFar !== undefined &&
            fadingMaterial.fadeFar > 0
        );
    }

    /**
     * Patch the THREE.ShaderChunk on first call with some extra shader chunks.
     */
    export function patchGlobalShaderChunks() {
        if (THREE.ShaderChunk.fading_pars_vertex === undefined) {
            Object.assign(THREE.ShaderChunk, fadingShaderChunk);
        }
    }

    /**
     * Update the internals of the `FadingFeature` depending on the value of [[fadeNear]]. The
     * fading feature will be disabled if fadeFar <= 0.0.
     *
     * @param fadingMaterial FadingFeature
     */
    export function updateFadingFeature(fadingMaterial: FadingFeature): void {
        assert(fadingMaterial.defines !== undefined);
        assert(fadingMaterial.shaderUniforms !== undefined);

        // Update entire material to add/remove shader fading chunks, this happens when we
        // enable/disable fading after material creation. Feature is marked via dummy define, which
        // informs about fading feature state, even if such define is not required to control
        // feature state, it makes it easy to check for shader changes.
        const useFading = isEnabled(fadingMaterial);
        const needsUpdate = setShaderDefine(fadingMaterial.defines, "FADING_MATERIAL", useFading);
        // Enable/disable entire feature with material re-compile.
        fadingMaterial.needsUpdate = needsUpdate;

        // Check if shader uniforms references are already set in onBeforeCompile callback.
        if (
            fadingMaterial.shaderUniforms!.fadeNear !== undefined &&
            fadingMaterial.shaderUniforms!.fadeFar !== undefined
        ) {
            // Update shader internal uniforms only if fading is enabled.
            if (useFading) {
                fadingMaterial.shaderUniforms!.fadeNear.value = fadingMaterial.fadeNear;
                fadingMaterial.shaderUniforms!.fadeFar.value = fadingMaterial.fadeFar;
            }
            // Perform one time update of uniforms to defaults when feature disabled (for clarity).
            else if (needsUpdate) {
                fadingMaterial.shaderUniforms!.fadeNear.value = FadingFeature.DEFAULT_FADE_NEAR;
                fadingMaterial.shaderUniforms!.fadeFar.value = FadingFeature.DEFAULT_FADE_FAR;
            }
        }
    }

    /**
     * This function should be called on implementors of FadingFeature in the `onBeforeCompile`
     * callback of that material. It adds the required code to the shaders and declares the new
     * uniforms that control fading based on view distance.
     *
     * @param fadingMaterial Material to add uniforms to.
     * @param shader [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(fadingMaterial: FadingFeature, shader: THREE.Shader) {
        if (!isEnabled(fadingMaterial)) {
            return;
        }
        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are not required for this material, so the fading shader chunks
        // have the #ifdefs commented out. Feature use one define just to denote feature attached.

        // Create feature specific uniforms for the shader (if not already existing), initialize
        // them with current values retrieved from feature properties.
        const uniforms = shader.uniforms as UniformsType;
        uniforms.fadeNear = { value: fadingMaterial.fadeNear };
        uniforms.fadeFar = { value: fadingMaterial.fadeFar };

        // Assign actual shader uniforms to mixin uniforms references map for later updates.
        // NOTE: Without it the uniforms could not be updated via feature setter.
        fadingMaterial.shaderUniforms = uniforms;

        // Append the new fading shader cod directly after the fog code. This is done by adding an
        // include directive for the fading code.
        shader.vertexShader = insertShaderInclude(
            shader.vertexShader,
            "fog_pars_vertex",
            "fading_pars_vertex"
        );

        shader.vertexShader = insertShaderInclude(
            shader.vertexShader,
            "fog_vertex",
            "fading_vertex",
            true
        );

        shader.fragmentShader = insertShaderInclude(
            shader.fragmentShader,
            "fog_pars_fragment",
            "fading_pars_fragment"
        );

        shader.fragmentShader = insertShaderInclude(
            shader.fragmentShader,
            "fog_fragment",
            "fading_fragment",
            true
        );
    }

    /**
     * As three.js is rendering the transparent objects last (internally), regardless of their
     * renderOrder value, we set the transparent value to false in the [[onAfterRenderCall]]. In
     * [[onBeforeRender]], the function [[calculateDepthFromCameraDistance]] sets it to true if the
     * fade distance value is less than 1.
     *
     * @param object [[THREE.Object3D]] to prepare for rendering.
     * @param viewRanges The visibility ranges (clip planes and maximum visible distance) for
     * actual camera setup.
     * @param fadeNear The fadeNear value to set in the material.
     * @param fadeFar The fadeFar value to set in the material.
     * @param updateUniforms If `true`, the fading uniforms are set. Not required if material is
     *          handling the uniforms already, like in a [[THREE.ShaderMaterial]].
     * @param additionalCallback If defined, this function will be called before the function will
     *          return.
     */
    export function addRenderHelper(
        object: THREE.Object3D,
        viewRanges: ViewRanges,
        fadeNear: number | undefined,
        fadeFar: number | undefined,
        updateUniforms: boolean,
        additionalCallback?: (
            renderer: THREE.WebGLRenderer,
            material: THREE.Material & FadingFeature
        ) => void
    ) {
        // tslint:disable-next-line:no-unused-variable
        object.onBeforeRender = chainCallbacks(
            object.onBeforeRender,
            (
                renderer: THREE.WebGLRenderer,
                scene: THREE.Scene,
                camera: THREE.Camera,
                geometry: THREE.Geometry | THREE.BufferGeometry,
                material: THREE.Material & FadingFeature,
                group: THREE.Group
            ) => {
                const fadingMaterial = material as FadingFeature;

                fadingMaterial.fadeNear =
                    fadeNear === undefined || fadeNear === FadingFeature.DEFAULT_FADE_NEAR
                        ? FadingFeature.DEFAULT_FADE_NEAR
                        : cameraToWorldDistance(fadeNear, viewRanges);

                fadingMaterial.fadeFar =
                    fadeFar === undefined || fadeFar === FadingFeature.DEFAULT_FADE_FAR
                        ? FadingFeature.DEFAULT_FADE_FAR
                        : cameraToWorldDistance(fadeFar, viewRanges);

                if (additionalCallback !== undefined) {
                    additionalCallback(renderer, material);
                }
            }
        );
    }
}

/**
 * Mixin class for extended THREE materials. Adds new properties required for `fadeNear` and
 * `fadeFar`. There is some special handling for the fadeNear/fadeFar properties, which get some
 * setters and getters in a way that works well with the mixin.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class FadingFeatureMixin implements FadingFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    defines?: any;
    shaderUniforms?: UniformsType;
    private m_fadeNear: number = FadingFeature.DEFAULT_FADE_NEAR;
    private m_fadeFar: number = FadingFeature.DEFAULT_FADE_FAR;

    /**
     * @see [[FadingFeature#fadeNear]]
     */
    protected getFadeNear(): number {
        return this.m_fadeNear;
    }
    /**
     * @see [[FadingFeature#fadeNear]]
     */
    protected setFadeNear(value: number) {
        const needsUpdate = value !== this.m_fadeNear;
        if (needsUpdate) {
            this.m_fadeNear = value;
            FadingFeature.updateFadingFeature(this);
        }
    }

    /**
     * @see [[FadingFeature#fadeFar]]
     */
    protected getFadeFar(): number {
        return this.m_fadeFar;
    }
    /**
     * @see [[FadingFeature#fadeFar]]
     */
    protected setFadeFar(value: number) {
        const needsUpdate = value !== this.m_fadeFar;
        if (needsUpdate) {
            this.m_fadeFar = value;
            FadingFeature.updateFadingFeature(this);
        }
    }

    /**
     * The mixin classes should call this method to register the properties [[fadeNear]] and
     * [[fadeFar]].
     */
    protected addFadingProperties(): void {
        Object.defineProperty(this, "fadeNear", {
            get: () => {
                return this.getFadeNear();
            },
            set: val => {
                this.setFadeNear(val);
            }
        });
        Object.defineProperty(this, "fadeFar", {
            get: () => {
                return this.getFadeFar();
            },
            set: val => {
                this.setFadeFar(val);
            }
        });
    }

    /**
     * Apply the fadeNear/fadeFar values from the parameters to the respective properties.
     *
     * @param params `FadingMeshBasicMaterial` parameters.
     */
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // Prepare map for shader defines.
        if (this.defines === undefined) {
            this.defines = {};
        }
        // Prepare map for holding uniforms references from the actual shader.
        if (this.shaderUniforms === undefined) {
            this.shaderUniforms = {};
        }

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.fadeNear !== undefined) {
                this.setFadeNear(params.fadeNear);
            }
            if (params.fadeFar !== undefined) {
                this.setFadeFar(params.fadeFar);
            }
        }

        const material = this as any;
        material.onBeforeCompile = chainCallbacks(
            material.onBeforeCompile,
            (shader: THREE.Shader) => {
                FadingFeature.onBeforeCompile(this, shader);
            }
        );
        // Update (re-compile) shader code to include new shader chunks only if feature is enabled.
        this.needsUpdate = FadingFeature.isEnabled(this);
    }

    /**
     * Copy fadeNear/fadeFar values from other FadingFeature.
     *
     * @param source The material to copy property values from.
     */
    protected copyFadingParameters(source: FadingFeature) {
        this.setFadeNear(
            source.fadeNear === undefined ? FadingFeature.DEFAULT_FADE_NEAR : source.fadeNear
        );
        this.setFadeFar(
            source.fadeFar === undefined ? FadingFeature.DEFAULT_FADE_FAR : source.fadeFar
        );
        return this;
    }
}

export namespace ExtrusionFeature {
    /**
     * Checks if feature is enabled based on [[ExtrusionFeature]] properties.
     *
     * @param extrusionMaterial
     */
    export function isEnabled(extrusionMaterial: ExtrusionFeature) {
        return (
            extrusionMaterial.extrusionRatio !== undefined &&
            extrusionMaterial.extrusionRatio >= ExtrusionFeatureDefs.DEFAULT_RATIO_MIN
        );
    }

    /**
     * Patch the THREE.ShaderChunk on first call with some extra shader chunks.
     */
    export function patchGlobalShaderChunks() {
        if (THREE.ShaderChunk.extrusion_pars_vertex === undefined) {
            Object.assign(THREE.ShaderChunk, extrusionShaderChunk);
        }
    }

    /**
     * Update the internals of the `ExtrusionFeature` depending on the value of [[extrusionRatio]].
     *
     * @param ExtrusionMaterial ExtrusionFeature
     */
    export function updateExtrusionFeature(extrusionMaterial: ExtrusionFeature): void {
        assert(extrusionMaterial.defines !== undefined);
        assert(extrusionMaterial.shaderUniforms !== undefined);

        // Setup shader define that when changed will force material re-compile.
        const useExtrusion = isEnabled(extrusionMaterial);
        // Use shader define as marker if feature is enabled/disabled, this is not necessary
        // required, but material requires update (re-compile) anyway to add/remove shader chunks.
        const needsUpdate = setShaderDefine(
            extrusionMaterial.defines,
            "EXTRUSION_MATERIAL",
            useExtrusion
        );
        // Enable/disable entire feature with material re-compile.
        extrusionMaterial.needsUpdate = needsUpdate;

        // Check if corresponding uniform reference was already set in onBeforeCompile callback.
        if (extrusionMaterial.shaderUniforms!.extrusionRatio !== undefined) {
            // Update uniform with new value
            if (useExtrusion) {
                extrusionMaterial.shaderUniforms!.extrusionRatio.value =
                    extrusionMaterial.extrusionRatio;
            }
            // Reset uniform to default, one time only, when feature is disabled (just for clarity).
            else if (needsUpdate) {
                extrusionMaterial.shaderUniforms!.extrusionRatio.value =
                    ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
            }
        }
    }

    /**
     * This function should be called on implementors of ExtrusionFeature in the `onBeforeCompile`
     * callback of that material. It adds the required code to the shaders and declares the new
     * uniforms that control extrusion.
     *
     * @param extrusionMaterial Material to add uniforms to.
     * @param shader [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(extrusionMaterial: ExtrusionFeature, shader: THREE.Shader) {
        if (!isEnabled(extrusionMaterial)) {
            return;
        }

        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.

        // Create feature specific uniform for the shader (if not already existing) and initialize
        // it with current feature value:
        const uniforms = shader.uniforms as UniformsType;
        uniforms.extrusionRatio = { value: extrusionMaterial.extrusionRatio };

        // Assign actual shader uniform map to mixin uniform reference for later updates.
        // NOTE: Without it the uniform will not be actually updated via feature setter.
        extrusionMaterial.shaderUniforms = uniforms;

        shader.vertexShader = insertShaderInclude(
            shader.vertexShader,
            "common",
            "extrusion_pars_vertex"
        );

        shader.vertexShader = insertShaderInclude(
            shader.vertexShader,
            "begin_vertex",
            "extrusion_vertex",
            true
        );

        shader.fragmentShader = insertShaderInclude(
            shader.fragmentShader,
            "fog_pars_fragment",
            "extrusion_pars_fragment"
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <normal_fragment_begin>",
            "#include <extrusion_normal_fragment_begin>"
        );

        shader.fragmentShader = insertShaderInclude(
            shader.fragmentShader,
            "fog_fragment",
            "extrusion_fragment",
            true
        );
    }
}

/**
 * Mixin class for extended THREE materials. Adds new properties required for `extrusionRatio`.
 *
 * There is some special handling for the extrusionRatio property, which get some setters and
 * getters in a way that works well with the mixin.
 */
export class ExtrusionFeatureMixin implements ExtrusionFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    defines?: any;
    shaderUniforms?: UniformsType;
    private m_extrusion: number = ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;

    /**
     * @see [[ExtrusionFeature#extrusion]]
     */
    protected getExtrusionRatio(): number {
        return this.m_extrusion;
    }
    /**
     * @see [[ExtrusionFeature#extrusion]]
     */
    protected setExtrusionRatio(value: number) {
        const needsUpdate = value !== this.m_extrusion;
        if (needsUpdate) {
            this.m_extrusion = value;
            ExtrusionFeature.updateExtrusionFeature(this);
        }
    }

    /**
     * The mixin class should call this method to register the property [[extrusionRatio]]
     */
    protected addExtrusionProperties(): void {
        Object.defineProperty(this, "extrusionRatio", {
            get: () => {
                return this.getExtrusionRatio();
            },
            set: val => {
                this.setExtrusionRatio(val);
            }
        });
    }

    /**
     * Apply the extrusionRatio value from the parameters to the respective properties.
     */
    protected applyExtrusionParameters(params?: ExtrusionFeatureParameters) {
        // Prepare map for holding shader defines.
        if (this.defines === undefined) {
            this.defines = {};
        }
        // Create uniforms map that will hold internal shader uniforms references.
        if (this.shaderUniforms === undefined) {
            this.shaderUniforms = {};
        }

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.extrusionRatio !== undefined) {
                this.setExtrusionRatio(params.extrusionRatio);
            }
        }

        const material = this as any;
        material.onBeforeCompile = chainCallbacks(
            material.onBeforeCompile,
            (shader: THREE.Shader) => {
                ExtrusionFeature.onBeforeCompile(this, shader);
            }
        );

        this.needsUpdate = ExtrusionFeature.isEnabled(this);
    }

    /**
     * Copy extrusionRatio values from other ExtrusionFeature.
     *
     * @param source The material to copy property values from.
     */
    protected copyExtrusionParameters(source: ExtrusionFeature) {
        if (source.extrusionRatio !== undefined) {
            this.setExtrusionRatio(source.extrusionRatio);
        }
        return this;
    }
}

/**
 * Subclass of [[THREE.MeshBasicMaterial]]. Adds new properties required for [[fadeNear]] and
 * [[fadeFar]]. In addition to the new properties (which update their respective uniforms), it is
 * also required to update the material in their objects [[onBeforeRender]] and [[OnAfterRender]]
 * calls, where their flag [[transparent]] is set and the internal fadeNear/fadeFar values are
 * updated to world space distances.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class MapMeshBasicMaterial extends THREE.MeshBasicMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature {
    /**
     * Constructs a new `FadingMeshBasicMaterial`.
     *
     * @param params `FadingMeshBasicMaterial` parameters.
     */
    constructor(
        params?: THREE.MeshBasicMaterialParameters &
            FadingFeatureParameters &
            ExtrusionFeatureParameters &
            DisplacementFeatureParameters
    ) {
        super(params);
        //console.log("Create MapMeshMaterial, params: ", params);
        FadingFeature.patchGlobalShaderChunks();

        this.addFadingProperties();
        this.applyFadingParameters(params);

        ExtrusionFeature.patchGlobalShaderChunks();

        this.addExtrusionProperties();
        this.applyExtrusionParameters(params);

        this.addDisplacementProperties();
        this.applyDisplacementParameters(params);
    }

    clone(): this {
        return new MapMeshBasicMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.copyFadingParameters(source);
        this.copyExtrusionParameters(source);
        this.copyDisplacementParameters(source);
        return this;
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in [[FadingFeatureMixin]] and [[ExtrusionFeatureMixin]], see below:
    //
    // applyMixinsWithoutProperties(FadingMeshBasicMaterial, [FadingFeatureMixin]);
    // applyMixinsWithoutProperties(ExtrudionMeshBasicMaterial, [ExtrusionFeatureMixin]);
    //
    // Mixin declarations start ---------------------------------------------------------

    get fadeNear(): number {
        return FadingFeature.DEFAULT_FADE_NEAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeNear(value: number) {
        // to be overridden
    }

    get fadeFar(): number {
        return FadingFeature.DEFAULT_FADE_FAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeFar(value: number) {
        // to be overridden
    }

    get extrusionRatio(): number {
        return ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    }
    // tslint:disable-next-line:no-unused-variable
    set extrusionRatio(value: number) {
        // to be overridden
    }

    get displacementMap(): THREE.Texture | undefined {
        return undefined;
    }

    // tslint:disable-next-line:no-unused-variable
    set displacementMap(value: THREE.Texture | undefined) {
        // to be overridden
    }

    protected addFadingProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyFadingParameters(source: FadingFeature) {
        // to be overridden
    }

    protected addExtrusionProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyExtrusionParameters(params?: ExtrusionFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyExtrusionParameters(source: FadingFeature) {
        // to be overridden
    }

    protected addDisplacementProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyDisplacementParameters(params?: DisplacementFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyDisplacementParameters(source: DisplacementFeature) {
        // to be overridden
    }
    // Mixin declarations end -----------------------------------------------------------
}

/**
 * Subclass of THREE.MeshStandardMaterial. Adds new properties required for `fadeNear` and
 * `fadeFar`. In addition to the new properties (which fill respective uniforms), it is also
 * required to update the material in their objects `onBeforeRender` and `OnAfterRender` calls,
 * where their flag `transparent` is set and the internal fadeNear/fadeFar values are updated to
 * world space distances.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class MapMeshStandardMaterial extends THREE.MeshStandardMaterial
    implements FadingFeature, ExtrusionFeature {
    uniformsNeedUpdate?: boolean;

    /**
     * Constructs a new `FadingMeshStandardMaterial`.
     *
     * @param params `FadingMeshStandardMaterial` parameters.
     */
    constructor(
        params?: THREE.MeshStandardMaterialParameters &
            FadingFeatureParameters &
            ExtrusionFeatureParameters
    ) {
        super(params);

        FadingFeature.patchGlobalShaderChunks();

        this.addFadingProperties();
        this.applyFadingParameters(params);

        ExtrusionFeature.patchGlobalShaderChunks();

        this.addExtrusionProperties();
        this.applyExtrusionParameters(params);
    }

    clone(): this {
        return new MapMeshStandardMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.copyFadingParameters(source);
        this.copyExtrusionParameters(source);
        return this;
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in [[FadingFeatureMixin]] and [[ExtrusionFeatureMixin]], see below:
    //
    // applyMixinsWithoutProperties(FadingMeshBasicMaterial, [FadingFeatureMixin]);
    // applyMixinsWithoutProperties(ExtrudionMeshBasicMaterial, [ExtrusionFeatureMixin]);
    //
    // Mixin declarations start ---------------------------------------------------------

    get fadeNear(): number {
        return FadingFeature.DEFAULT_FADE_NEAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeNear(value: number) {
        // to be overridden
    }

    get fadeFar(): number {
        return FadingFeature.DEFAULT_FADE_FAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeFar(value: number) {
        // to be overridden
    }

    get extrusionRatio(): number {
        return ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    }
    // tslint:disable-next-line:no-unused-variable
    set extrusionRatio(value: number) {
        // to be overridden
    }

    protected addFadingProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyFadingParameters(source: FadingFeature) {
        // to be overridden
    }

    protected addExtrusionProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyExtrusionParameters(params?: ExtrusionFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyExtrusionParameters(source: FadingFeature) {
        // to be overridden
    }
    // Mixin declarations end -----------------------------------------------------------
}

/**
 * Finish the classes MapMeshBasicMaterial and MapMeshStandardMaterial by assigning them the actual
 * implementations of the mixed in functions.
 */
applyMixinsWithoutProperties(MapMeshBasicMaterial, [FadingFeatureMixin]);
applyMixinsWithoutProperties(MapMeshStandardMaterial, [FadingFeatureMixin]);
applyMixinsWithoutProperties(MapMeshBasicMaterial, [ExtrusionFeatureMixin]);
applyMixinsWithoutProperties(MapMeshStandardMaterial, [ExtrusionFeatureMixin]);
applyMixinsWithoutProperties(MapMeshBasicMaterial, [DisplacementFeatureMixin]);
