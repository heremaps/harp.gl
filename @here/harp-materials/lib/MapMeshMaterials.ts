/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { applyMixinsWithoutProperties, assert, chainCallbacks } from "@here/harp-utils";
import * as THREE from "three";

import { DisplacementFeature, DisplacementFeatureParameters } from "./DisplacementFeature";
import { ExtrusionFeatureDefs } from "./MapMeshMaterialsDefs";
import extrusionShaderChunk from "./ShaderChunks/ExtrusionChunks";
import fadingShaderChunk from "./ShaderChunks/FadingChunks";
import { simpleLightingShadowChunk } from "./ShaderChunks/ShadowChunks";
import { disableBlending, enableBlending, insertShaderInclude, setShaderDefine } from "./Utils";

const emptyTexture = new THREE.Texture();

/**
 * The MapMeshMaterials [[MapMeshBasicMaterial]] and [[MapMeshStandardMaterial]] are the standard
 * [[THREE.MeshBasicMaterial]] and [[THREE.MeshStandardMaterial]], with the addition functionality
 * of fading out the geometry between a fadeNear and fadeFar value.
 *
 * The implementation is designed around a mixin class {@link FadingFeatureMixin}, which requires
 * a bit of care when adding the FadingFeature to the existing mesh classes, but it is safe to use
 * and also reduces code duplication.
 */

/**
 * Parameters used when constructing a new implementor of {@link FadingFeature}.
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
 * Parameter used to control patching the standard material shader to ensure that the materials
 * color isn't affected by the light direction, only valid for techniques that are "fill"
 */
export interface ShadowFeatureParameters {
    /**
     * Whether the diffuse light component is removed (i.e. the materials color is therefore just
     * the ambient + shadow).
     */
    removeDiffuseLight?: boolean;
}

/**
 * Parameters used when constructing a new implementor of {@link ExtrusionFeature}.
 */
export interface ExtrusionFeatureParameters {
    /**
     * Ratio of the extruded objects, where `1.0` is the default value
     */
    extrusionRatio?: number;

    /**
     * Enable z-fighting workaround that doesn't animate buildings with `height <
     * [[ExtrusionFeatureDefs.MIN_BUILDING_HEIGHT]]`.
     *
     * Should be applied to `polygon` materials using this feature.
     */
    zFightingWorkaround?: boolean;
}

/**
 * Used internally.
 *
 * @hidden
 */
export interface UniformsType {
    [index: string]: THREE.IUniform;
}

/**
 * Type of callback used internally by THREE.js for shader creation.
 *
 * @hidden
 */
type CompileCallback = (shader: THREE.Shader, renderer: any) => void;

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
     * @deprecated Changes to this property are ignored.
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
     * Defines callback available in THREE.js materials.
     *
     * Called before shader program compilation to generate vertex & fragment shader output code.
     */
    onBeforeCompile?: CompileCallback;
}

/**
 * Used internally.
 *
 * @hidden
 */
export interface MixinShaderProperties {
    /**
     * Used internally for material shader defines.
     */
    shaderDefines?: any;

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
 * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
 * [0..maxVisibilityRange].
 *
 * Copy from MapViewUtils, since it cannot be accessed here because of circular dependencies.
 *
 * @param distance - Distance from the camera (range: [0, 1]).
 * @param visibilityRange - object describing maximum and minimum visibility range - distances
 * from camera at which objects won't be rendered anymore.
 */
function cameraToWorldDistance(distance: number, visibilityRange: ViewRanges): number {
    return distance * visibilityRange.maximum;
}

/**
 * Provides common interface from mixin to internal material defines and shader uniforms.
 *
 * Call this function just after [THREE.Material] is constructed, so in derived classes after
 * super c-tor call.
 * @param mixin - The mixin that will add features to [[THREE.Material]].
 * @param material - The material that mixin feature is being applied.
 */
function linkMixinWithMaterial(
    mixin: MixinShaderProperties,
    material: HiddenThreeJSMaterialProperties
) {
    // Some materials (MeshBasicMaterial) have no defines property created in c-tor.
    // In such case create it manually, such defines will be also injected to the shader
    // via generic THREE.js code - see THREE/WebGLProgram.js.
    if (material.defines === undefined) {
        material.defines = {};
    }
    // Link internal THREE.js material defines with mixin reference.
    // Those defines are usually created in Material c-tor, if not we have fallback above.
    mixin.shaderDefines = material.defines;

    // Prepare map for holding uniforms references from the actual shader, but check if
    // it was not already created with other mixin feature.
    if (mixin.shaderUniforms === undefined) {
        mixin.shaderUniforms = {};
    }
    // Shader uniforms may not be linked at this stage, they are injected available via Shader
    // object in onBeforeCompile callback, see: linkMixinWithShader().
}

/**
 * Links mixin [[MixinShaderProperties.shaderUniforms]] with actual material shader uniforms.
 *
 * Function injects features (mixin) specific shader uniforms to material's shader, it also
 * updates uniforms references so [[MixinShaderProperties.shaderUniforms]] will contain full
 * uniforms map (both feature specific and internal ones).
 * This function should be called before material's shader is pre-compiled, so the new uniforms
 * from the mixin feature are known to shader processor. The best place to use is
 * [[Material.onBeforeCompile]].
 * @param mixin - The mixin feature being applied to the material.
 * @param shader - The actual shader linked to the [[THREE.Material]].
 */
function linkMixinWithShader(mixin: MixinShaderProperties, shader: THREE.Shader) {
    Object.assign(shader.uniforms, mixin.shaderUniforms);
    mixin.shaderUniforms = shader.uniforms;
}

/**
 * Base interface for all objects that should fade in the distance. The implementation of the actual
 * FadingFeature is done with the help of the mixin class {@link FadingFeatureMixin} and a set of
 * supporting functions in the namespace of the same name.
 */
export interface FadingFeature extends HiddenThreeJSMaterialProperties, MixinShaderProperties {
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
 * Base interface for all objects that should have animated extrusion effect.
 *
 * @remarks
 * The implementation of the actual ExtrusionFeature is done with
 * the help of the mixin class {@link ExtrusionFeatureMixin}
 * and a set of supporting functions in the namespace of the same name.
 */
export interface ExtrusionFeature extends HiddenThreeJSMaterialProperties, MixinShaderProperties {
    /**
     * Ratio of the extruded objects, where `1.0` is the default value. Minimum suggested value
     * is `0.01`
     */
    extrusionRatio?: number;
}

/**
 * Determines whether a given material supports extrusion.
 * @param material The material to check.
 * @returns Whether the given material supports extrusion.
 */
export function hasExtrusionFeature(material: any): material is ExtrusionFeature {
    return "extrusionRatio" in material;
}

// See https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/no-redeclare.md#ignoredeclarationmerge
// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace DisplacementFeature {
    /**
     * Checks if feature is enabled (displacement map defined).
     *
     * @param displacementMaterial -
     */
    export function isEnabled(displacementMaterial: DisplacementFeature) {
        return displacementMaterial.displacementMap !== null;
    }

    /**
     * Update the internals of the `DisplacementFeature` depending on the value of
     * [[displacementMap]].
     *
     * @param displacementMaterial - DisplacementFeature
     */
    export function updateDisplacementFeature(
        displacementMaterial: DisplacementFeature & MixinShaderProperties
    ): void {
        assert(displacementMaterial.shaderDefines !== undefined);
        assert(displacementMaterial.shaderUniforms !== undefined);

        const useDisplacementMap = isEnabled(displacementMaterial);
        // Whenever displacement feature state changes (between enabled/disabled) material will be
        // re-compiled, forcing new shader chunks to be added (or removed).
        const needsUpdate = setShaderDefine(
            displacementMaterial.shaderDefines,
            "USE_DISPLACEMENTMAP",
            useDisplacementMap
        );
        displacementMaterial.needsUpdate = needsUpdate;

        // Update texture after change.
        if (useDisplacementMap) {
            const texture = displacementMaterial.displacementMap!;
            texture.needsUpdate = true;
            displacementMaterial.shaderUniforms!.displacementMap.value = texture;
        } else if (needsUpdate) {
            displacementMaterial.shaderUniforms!.displacementMap.value = emptyTexture;
        }
    }

    /**
     * This function should be called on implementors of DisplacementFeature in the
     * `onBeforeCompile` callback of that material. It adds the required code to the shaders to
     * apply displacement maps.
     *
     * @param displacementMaterial - Material to add uniforms to.
     * @param shader - [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(
        displacementMaterial: DisplacementFeature & MixinShaderProperties,
        shader: THREE.Shader
    ) {
        if (!isEnabled(displacementMaterial)) {
            return;
        }
        assert(displacementMaterial.shaderUniforms !== undefined);

        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are required for this material, we use one define working as a flag,
        // which enables/disables some chunks of shader code.
        linkMixinWithShader(displacementMaterial, shader);

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

export class DisplacementFeatureMixin implements DisplacementFeature, MixinShaderProperties {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    defines?: any;
    shaderDefines?: any;
    shaderUniforms?: UniformsType;
    onBeforeCompile?: CompileCallback;
    private m_displacementMap: THREE.Texture | null = null;

    // This is here to keep tslint from reporting a missing property, the getter that's actually
    // used by materials is added in [[addDisplacementProperties]].
    get displacementMap(): THREE.Texture | null {
        return this.m_displacementMap;
    }

    // This is here to keep tslint from reporting a missing property, the setter that's actually
    // used by materials is added in [[addDisplacementProperties]].
    set displacementMap(map: THREE.Texture | null) {
        this.setDisplacementMap(map);
    }

    protected getDisplacementMap(): THREE.Texture | null {
        return this.m_displacementMap;
    }

    protected setDisplacementMap(map: THREE.Texture | null): void {
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
        linkMixinWithMaterial(this, this);

        assert(this.shaderDefines !== undefined);
        assert(this.shaderUniforms !== undefined);

        // Create uniforms with default values, this ensures they are always set created,
        // so no need for checks in setters.
        const uniforms = this.shaderUniforms!;
        uniforms.displacementMap = new THREE.Uniform(emptyTexture);
        uniforms.displacementScale = new THREE.Uniform(1);
        uniforms.displacementBias = new THREE.Uniform(0);

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.displacementMap !== undefined) {
                this.setDisplacementMap(params.displacementMap);
            }
        }

        this.onBeforeCompile = chainCallbacks(this.onBeforeCompile, (shader: THREE.Shader) => {
            DisplacementFeature.onBeforeCompile(this, shader);
        });

        // Require material update at least once, because of new shader chunks added.
        this.needsUpdate = DisplacementFeature.isEnabled(this);
    }

    /**
     * Copy displacementMap from other DisplacementFeature.
     *
     * @param source - The material to copy property values from.
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
     * @param fadingMaterial - FadingFeature.
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
     * Checks if feature is defined based on feature params.
     *
     * Fading feature will be defined if fadeNear and fadeFar are defined, their values
     * are not checked for reasonable values.
     *
     * @param fadingMaterial FadingFeature.
     */
    export function isDefined(fadingMaterial: FadingFeature) {
        return fadingMaterial.fadeNear !== undefined && fadingMaterial.fadeFar !== undefined;
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
     * @param fadingMaterial - FadingFeature
     */
    export function updateFadingFeature(fadingMaterial: FadingFeature): void {
        assert(fadingMaterial.shaderDefines !== undefined);
        assert(fadingMaterial.shaderUniforms !== undefined);

        // Update entire material to add/remove shader fading chunks, this happens when we
        // enable/disable fading after material creation. Feature is marked via dummy define, which
        // informs about fading feature state, even if such define is not required to control
        // feature state, it makes it easy to check for shader changes.
        const useFading = isEnabled(fadingMaterial);
        const needsUpdate = setShaderDefine(
            fadingMaterial.shaderDefines,
            "FADING_MATERIAL",
            useFading
        );
        // Enable/disable entire feature with material re-compile, this will also cause
        // new uniforms injection.
        fadingMaterial.needsUpdate = needsUpdate;

        // Check if shader uniforms references are already set in onBeforeCompile callback.
        assert(
            fadingMaterial.shaderUniforms!.fadeNear !== undefined &&
                fadingMaterial.shaderUniforms!.fadeFar !== undefined
        );

        // Update shader internal uniforms only if fading is enabled.
        if (useFading) {
            fadingMaterial.shaderUniforms!.fadeNear.value = fadingMaterial.fadeNear;
            fadingMaterial.shaderUniforms!.fadeFar.value = fadingMaterial.fadeFar;
            if (needsUpdate) {
                enableBlending(fadingMaterial as THREE.Material);
            }
        }
        // Perform one time update of uniforms to defaults when feature disabled (for clarity).
        else if (needsUpdate) {
            fadingMaterial.shaderUniforms!.fadeNear.value = FadingFeature.DEFAULT_FADE_NEAR;
            fadingMaterial.shaderUniforms!.fadeFar.value = FadingFeature.DEFAULT_FADE_FAR;
            disableBlending(fadingMaterial as THREE.Material);
        }
    }

    /**
     * This function should be called on implementors of FadingFeature in the `onBeforeCompile`
     * callback of that material. It adds the required code to the shaders and declares the new
     * uniforms that control fading based on view distance.
     *
     * @param fadingMaterial - Material to add uniforms to.
     * @param shader - [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(fadingMaterial: FadingFeature, shader: THREE.Shader) {
        if (!isEnabled(fadingMaterial)) {
            return;
        }
        assert(fadingMaterial.shaderUniforms !== undefined);

        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are not required for this material, so the fading shader chunks
        // have no #ifdef preprocessed chunks. Feature utilized one define just to denote feature
        // attached and easy control its state, but this define may be stripped out if needed.
        linkMixinWithShader(fadingMaterial, shader);

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
     * @param object - [[THREE.Object3D]] to prepare for rendering.
     * @param viewRanges - The visibility ranges (clip planes and maximum visible distance) for
     * actual camera setup.
     * @param fadeNear - The fadeNear value to set in the material.
     * @param fadeFar - The fadeFar value to set in the material.
     * @param updateUniforms - If `true`, the fading uniforms are set. Not required if material is
     *          handling the uniforms already, like in a [[THREE.ShaderMaterial]].
     * @param additionalCallback - If defined, this function will be called before the function will
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
        object.onBeforeRender = chainCallbacks(
            object.onBeforeRender,
            (
                renderer: THREE.WebGLRenderer,
                scene: THREE.Scene,
                camera: THREE.Camera,
                geometry: THREE.BufferGeometry,
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
    shaderDefines?: any;
    shaderUniforms?: UniformsType;
    onBeforeCompile?: CompileCallback;
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
     * @param params - `FadingMeshBasicMaterial` parameters.
     */
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // Prepare maps for holding uniforms and defines references from the actual material.
        linkMixinWithMaterial(this, this);

        assert(this.shaderDefines !== undefined);
        assert(this.shaderUniforms !== undefined);

        // Create uniforms with default values, this ensures they are always set created,
        // so no need for checks in setters.
        this.shaderUniforms!.fadeNear = new THREE.Uniform(FadingFeature.DEFAULT_FADE_NEAR);
        this.shaderUniforms!.fadeFar = new THREE.Uniform(FadingFeature.DEFAULT_FADE_FAR);

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.fadeNear !== undefined) {
                this.setFadeNear(params.fadeNear);
            }
            if (params.fadeFar !== undefined) {
                this.setFadeFar(params.fadeFar);
            }
        }

        this.onBeforeCompile = chainCallbacks(this.onBeforeCompile, (shader: THREE.Shader) => {
            FadingFeature.onBeforeCompile(this, shader);
        });
        // Update (re-compile) shader code to include new shader chunks only if feature is enabled.
        this.needsUpdate = FadingFeature.isEnabled(this);
    }

    /**
     * Copy fadeNear/fadeFar values from other FadingFeature.
     *
     * @param source - The material to copy property values from.
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
     * Checks if feature is enabled based on {@link ExtrusionFeature} properties.
     *
     * @param extrusionMaterial -
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
     * @param ExtrusionMaterial - ExtrusionFeature
     */
    export function updateExtrusionFeature(extrusionMaterial: ExtrusionFeature): void {
        assert(extrusionMaterial.shaderDefines !== undefined);
        assert(extrusionMaterial.shaderUniforms !== undefined);

        // Setup shader define that when changed will force material re-compile.
        const useExtrusion = isEnabled(extrusionMaterial);
        // Use shader define as marker if feature is enabled/disabled, this is not necessary
        // required, but material requires update (re-compile) anyway to add/remove shader chunks.
        const needsUpdate = setShaderDefine(
            extrusionMaterial.shaderDefines,
            "EXTRUSION_MATERIAL",
            useExtrusion
        );
        // Enable/disable entire feature with material re-compile.
        extrusionMaterial.needsUpdate = needsUpdate;

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

    /**
     * This function should be called on implementors of ExtrusionFeature in the `onBeforeCompile`
     * callback of that material. It adds the required code to the shaders and declares the new
     * uniforms that control extrusion.
     *
     * @param extrusionMaterial - Material to add uniforms to.
     * @param shader - [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(extrusionMaterial: ExtrusionFeature, shader: THREE.Shader) {
        if (!isEnabled(extrusionMaterial)) {
            return;
        }
        assert(extrusionMaterial.shaderUniforms !== undefined);

        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them. No defines are required to preprocess
        // shader chunks, but we utilize one just to note the feature is enabled/disabled
        // (easier debugging), this define may be easily stripped out or replaced with simple
        // boolean flag.
        linkMixinWithShader(extrusionMaterial, shader);

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
 * @remarks
 * There is some special handling for the extrusionRatio property, which is animated via
 * {@link @here/harp-mapview#AnimatedExtrusionHandler} that is
 * using [[extrusionRatio]] setter and getter to update
 * extrusion in a way that works well with the mixin and EdgeMaterial.
 */
export class ExtrusionFeatureMixin implements ExtrusionFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    defines?: any;
    shaderDefines?: any;
    shaderUniforms?: UniformsType;
    onBeforeCompile?: CompileCallback;
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
        // Prepare maps for holding uniforms and defines references from the actual material.
        linkMixinWithMaterial(this, this);

        assert(this.shaderDefines !== undefined);
        assert(this.shaderUniforms !== undefined);

        if (params && params.zFightingWorkaround === true) {
            this.shaderDefines.ZFIGHTING_WORKAROUND = "";
        }

        // Create uniform with default value, this ensures that it is always created,
        // so no need for checks in setters.
        this.shaderUniforms!.extrusionRatio = new THREE.Uniform(
            ExtrusionFeatureDefs.DEFAULT_RATIO_MAX
        );

        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.extrusionRatio !== undefined) {
                this.setExtrusionRatio(params.extrusionRatio);
            }
        }

        this.onBeforeCompile = chainCallbacks(this.onBeforeCompile, (shader: THREE.Shader) => {
            ExtrusionFeature.onBeforeCompile(this, shader);
        });

        this.needsUpdate = ExtrusionFeature.isEnabled(this);
    }

    /**
     * Copy extrusionRatio values from other ExtrusionFeature.
     *
     * @param source - The material to copy property values from.
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
export class MapMeshBasicMaterial
    extends THREE.MeshBasicMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature {
    /**
     * Constructs a new `FadingMeshBasicMaterial`.
     *
     * @param params - `FadingMeshBasicMaterial` parameters.
     */
    constructor(
        params?: THREE.MeshBasicMaterialParameters &
            FadingFeatureParameters &
            ExtrusionFeatureParameters &
            DisplacementFeatureParameters
    ) {
        super(params);

        FadingFeature.patchGlobalShaderChunks();

        this.addFadingProperties();
        this.applyFadingParameters(params);

        ExtrusionFeature.patchGlobalShaderChunks();

        this.addExtrusionProperties();
        this.applyExtrusionParameters({ ...params, zFightingWorkaround: true });

        this.addDisplacementProperties();
        this.applyDisplacementParameters(params);
    }

    // overrides with THREE.js base classes are not recognized by tslint.
    clone(): this {
        return new MapMeshBasicMaterial().copy(this);
    }

    // overrides with THREE.js base classes are not recognized by tslint.
    copy(source: this): any {
        super.copy(source);
        this.copyFadingParameters(source);
        this.copyExtrusionParameters(source);
        this.copyDisplacementParameters(source);
        return this;
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in FadingFeatureMixin and ExtrusionFeatureMixin, see below:
    //
    // applyMixinsWithoutProperties(FadingMeshBasicMaterial, [FadingFeatureMixin]);
    // applyMixinsWithoutProperties(ExtrudionMeshBasicMaterial, [ExtrusionFeatureMixin]);
    //
    // Mixin declarations start ---------------------------------------------------------

    get fadeNear(): number {
        return FadingFeature.DEFAULT_FADE_NEAR;
    }

    set fadeNear(value: number) {
        // to be overridden
    }

    get fadeFar(): number {
        return FadingFeature.DEFAULT_FADE_FAR;
    }

    set fadeFar(value: number) {
        // to be overridden
    }

    get extrusionRatio(): number {
        return ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    }

    set extrusionRatio(value: number) {
        // to be overridden
    }

    get displacementMap(): THREE.Texture | null {
        return null;
    }

    set displacementMap(value: THREE.Texture | null) {
        // to be overridden
    }

    setDisplacementMap(value: THREE.Texture | null) {
        // to be overridden
    }

    protected addFadingProperties(): void {
        // to be overridden
    }

    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // to be overridden
    }

    protected copyFadingParameters(source: FadingFeature) {
        // to be overridden
    }

    protected addExtrusionProperties(): void {
        // to be overridden
    }

    protected applyExtrusionParameters(params?: ExtrusionFeatureParameters) {
        // to be overridden
    }

    protected copyExtrusionParameters(source: FadingFeature) {
        // to be overridden
    }

    protected addDisplacementProperties(): void {
        // to be overridden
    }

    protected applyDisplacementParameters(params?: DisplacementFeatureParameters) {
        // to be overridden
    }

    protected copyDisplacementParameters(source: DisplacementFeature) {
        // to be overridden
    }
    // Mixin declarations end -----------------------------------------------------------
}

export class MapMeshDepthMaterial extends THREE.MeshDepthMaterial implements ExtrusionFeature {
    constructor(params?: THREE.MeshDepthMaterialParameters & ExtrusionFeatureParameters) {
        super(params);

        ExtrusionFeature.patchGlobalShaderChunks();

        this.addExtrusionProperties();

        // We need to set these to false, because otherwise three.js complains that there are
        // outputs of the vertex shader not used in the pixel shader, the properties in question
        // are `vExtrusionRatio` and `vExtrusionAxis`.
        this.applyExtrusionParameters({ ...params, zFightingWorkaround: false });
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in{@link ExtrusionFeatureMixin}, see below:
    //
    // applyMixinsWithoutProperties(...);
    //

    // Mixin declarations start ---------------------------------------------------------
    get extrusionRatio(): number {
        return ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    }

    set extrusionRatio(value: number) {
        // to be overridden
    }

    protected addExtrusionProperties(): void {
        // to be overridden
    }

    protected applyExtrusionParameters(params?: ExtrusionFeatureParameters) {
        // to be overridden
    }

    protected copyExtrusionParameters(source: FadingFeature) {
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
export class MapMeshStandardMaterial
    extends THREE.MeshStandardMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature {
    uniformsNeedUpdate?: boolean;

    /**
     * Constructs a new `FadingMeshStandardMaterial`.
     *
     * @param params - `FadingMeshStandardMaterial` parameters.
     */
    constructor(
        params?: THREE.MeshStandardMaterialParameters &
            FadingFeatureParameters &
            ExtrusionFeatureParameters &
            ShadowFeatureParameters
    ) {
        super(params);

        FadingFeature.patchGlobalShaderChunks();

        this.addFadingProperties();
        this.applyFadingParameters(params);

        ExtrusionFeature.patchGlobalShaderChunks();

        this.addExtrusionProperties();
        this.applyExtrusionParameters({ ...params, zFightingWorkaround: true });

        if (params?.removeDiffuseLight === true) {
            this.onBeforeCompile = chainCallbacks(this.onBeforeCompile, shaderParameters => {
                const shader = shaderParameters as THREE.Shader;
                shader.fragmentShader = THREE.ShaderChunk.meshphysical_frag.replace(
                    "#include <lights_physical_pars_fragment>",
                    simpleLightingShadowChunk
                );
            });
        }
    }

    // overrides with THREE.js base classes are not recognized by tslint.
    clone(): this {
        return new MapMeshStandardMaterial().copy(this);
    }

    // overrides with THREE.js base classes are not recognized by tslint.
    copy(source: this): any {
        super.copy(source);
        this.copyFadingParameters(source);
        this.copyExtrusionParameters(source);
        return this;
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in FadingFeatureMixin and ExtrusionFeatureMixin, see below:
    //
    // applyMixinsWithoutProperties(FadingMeshBasicMaterial, [FadingFeatureMixin]);
    // applyMixinsWithoutProperties(ExtrudionMeshBasicMaterial, [ExtrusionFeatureMixin]);
    //
    // Mixin declarations start ---------------------------------------------------------

    get fadeNear(): number {
        return FadingFeature.DEFAULT_FADE_NEAR;
    }

    set fadeNear(value: number) {
        // to be overridden
    }

    get fadeFar(): number {
        return FadingFeature.DEFAULT_FADE_FAR;
    }

    set fadeFar(value: number) {
        // to be overridden
    }

    get extrusionRatio(): number {
        return ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    }

    set extrusionRatio(value: number) {
        // to be overridden
    }

    /**
     * This is needed to simplify the lighting calculation, currently there is no support for
     * switching this at runtime. It is required here to be a property because the parameters
     * are applied to this material, and if this isn't here, three.js will complain that the
     * property is missing.
     * @internal
     */
    get removeDiffuseLight(): boolean {
        return false;
    }

    /** @internal */
    set removeDiffuseLight(val: boolean) {
        // Stays empty.
    }

    protected addFadingProperties(): void {
        // to be overridden
    }

    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // to be overridden
    }

    protected copyFadingParameters(source: FadingFeature) {
        // to be overridden
    }

    protected addExtrusionProperties(): void {
        // to be overridden
    }

    protected applyExtrusionParameters(params?: ExtrusionFeatureParameters) {
        // to be overridden
    }

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
applyMixinsWithoutProperties(MapMeshDepthMaterial, [ExtrusionFeatureMixin]);
applyMixinsWithoutProperties(MapMeshBasicMaterial, [DisplacementFeatureMixin]);
