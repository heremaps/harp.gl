/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ViewRanges } from "@here/harp-datasource-protocol/lib/ViewRanges";
import { applyMixinsWithoutProperties, chainCallbacks } from "@here/harp-utils";
import { insertShaderInclude } from "./Utils";

import * as THREE from "three";

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
interface UnifomType {
    value: any;
}

/**
 * Used internally.
 *
 * @hidden
 */
interface UniformsType {
    [index: string]: UnifomType;
}

/**
 * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
 * [0..maxVisibilityRange].
 *
 * Copy from MapViewUtils, since it cannot be accessed here because of circular dependencies.
 *
 * @param distance Distance from the camera (range: [0, 1]).
 * @param visibilityRange object describiing maximum and minimum visibility range - distances
 * from camera at which objects won't be rendered anymore.
 */
function cameraToWorldDistance(distance: number, visibilityRange: ViewRanges): number {
    return distance * visibilityRange.maximum;
}

/**
 * Material properties used from THREE, which may not be defined in the type.
 */
export interface HiddenThreeJSMaterialProperties {
    needsUpdate?: boolean;

    /**
     * Used internally for material shader defines.
     */
    defines?: any;

    /**
     * Hidden ThreeJS value that is made public here. Required to add new uniforms to subclasses of
     * [[THREE.MeshBasicMaterial]]/[[THREE.MeshStandardMaterial]], basically all materials that are
     * not THREE.ShaderMaterial.
     */
    uniformsNeedUpdate?: boolean;

    /**
     * Available in all materials in ThreeJS.
     */
    transparent?: boolean;
}

/**
 * Base interface for all objects that should fade in the distance. The implemntation of the actual
 * FadingFeature is done with the help of the mixon class [[FadingFeatureMixin]] and a set of
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
 * Base interface for all objects that should have animated extrusion effect. The implemntation of
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
     * Update the internals of the `DisplacementFeature` depending on the value of
     * [[displacementMap]].
     *
     * @param displacementMaterial DisplacementFeature
     */
    export function updateDisplacementFeature(displacementMaterial: DisplacementFeature): void {
        displacementMaterial.needsUpdate = true;

        if (displacementMaterial.defines === undefined) {
            displacementMaterial.defines = {};
        }

        if (displacementMaterial.displacementMap !== undefined) {
            displacementMaterial.displacementMap.needsUpdate = true;
            // Add this define to differentiate it internally from other MeshBasicMaterial
            displacementMaterial.defines.USE_DISPLACEMENTMAP = "";
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
    export function onBeforeCompile(displacementMaterial: DisplacementFeature, shader: any) {
        if (displacementMaterial.displacementMap === undefined) {
            return;
        }
        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are not available for this material, so the fading shader chunks
        // have the #ifdefs commented out.

        // Create the uniforms for the shader (if not already existing), and add the new uniforms
        // to it:
        const uniforms = shader.uniforms as UniformsType;
        uniforms.displacementMap = { value: displacementMaterial.displacementMap };
        uniforms.displacementScale = { value: 1 };
        uniforms.displacementBias = { value: 0 };

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
    private m_displacementMap?: THREE.Texture;

    protected getDisplacementMap(): THREE.Texture | undefined {
        return this.m_displacementMap;
    }

    protected setDisplacementMap(map: THREE.Texture | undefined) {
        this.needsUpdate = this.needsUpdate || map !== this.m_displacementMap;
        this.m_displacementMap = map;
        if (this.needsUpdate) {
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
        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.displacementMap !== undefined) {
                this.setDisplacementMap(params.displacementMap);
            }
        }

        (this as any).onBeforeCompile = (shader: any) => {
            DisplacementFeature.onBeforeCompile(this, shader);
        };
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
    export function updateDistanceFadeFeature(fadingMaterial: FadingFeature): void {
        fadingMaterial.needsUpdate = true;

        if (fadingMaterial.defines === undefined) {
            fadingMaterial.defines = {};
        }

        if (fadingMaterial.fadeFar !== undefined && fadingMaterial.fadeFar > 0.0) {
            // Add this define to differentiate it internally from other MeshBasicMaterial
            fadingMaterial.defines.FADING_MATERIAL = "";
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
    export function onBeforeCompile(fadingMaterial: FadingFeature, shader: any) {
        if (fadingMaterial.fadeFar === undefined || fadingMaterial.fadeFar <= 0.0) {
            return;
        }
        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are not available for this material, so the fading shader chunks
        // have the #ifdefs commented out.

        // Create the uniforms for the shader (if not already existing), and add the new uniforms
        // to it:
        const uniforms = shader.uniforms as UniformsType;
        uniforms.fadeNear = { value: fadingMaterial.fadeNear };
        uniforms.fadeFar = { value: fadingMaterial.fadeFar };

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
     * As threejs is rendering the transparent objects last (internally), regardless of their
     * renderOrder value, we set the transparent value to false in the [[onAfterRenderCall]]. In
     * [[onBeforeRender]], the function [[calculateDepthFromCameraDistance]] sets it to true if the
     * fade distance value is less than 1.
     *
     * @param object [[THREE.Object3D]] to prepare for rendering.
     * @param viewRanges The visibility ranges (clip planes and maxiumum visible distance) for
     * actual camera setup.
     * @param fadeNear The fadeNear value to set in the material.
     * @param fadeFar The fadeFar value to set in the material.
     * @param forceMaterialToTransparent If `true`, the material will be forced to render with
     *          blending set to `true`. May be `false` if the material is known to be transparent
     *          anyway.
     * @param updateUniforms If `true`, the fading uniforms are set. Not rquired if material is
     *          handling the uniforms already, like in a [[THREE.ShaderMaterial]].
     * @param additionalCallback If defined, this function will be called before the function will
     *          return.
     */
    export function addRenderHelper(
        object: THREE.Object3D,
        viewRanges: ViewRanges,
        fadeNear: number | undefined,
        fadeFar: number | undefined,
        forceMaterialToTransparent: boolean,
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
                if (forceMaterialToTransparent) {
                    //
                    material.transparent = true;
                }
                const fadingMaterial = material as FadingFeature;

                fadingMaterial.fadeNear =
                    fadeNear === undefined
                        ? FadingFeature.DEFAULT_FADE_NEAR
                        : cameraToWorldDistance(fadeNear, viewRanges);

                fadingMaterial.fadeFar =
                    fadeFar === undefined
                        ? FadingFeature.DEFAULT_FADE_FAR
                        : cameraToWorldDistance(fadeFar, viewRanges);

                if (updateUniforms) {
                    const properties = renderer.properties.get(material);

                    if (
                        properties.shader !== undefined &&
                        properties.shader.uniforms.fadeNear !== undefined
                    ) {
                        properties.shader.uniforms.fadeNear.value = fadingMaterial.fadeNear;
                        properties.shader.uniforms.fadeFar.value = fadingMaterial.fadeFar;
                        fadingMaterial.uniformsNeedUpdate = true;
                    }
                }

                if (additionalCallback !== undefined) {
                    additionalCallback(renderer, material);
                }
            }
        );

        if (forceMaterialToTransparent) {
            object.onAfterRender = (renderer, scene, camera, geom, material) => {
                material.transparent = false;
            };
        }
    }
}

/**
 * Mixin class for extended THREE materials. Adds new properties required for `fadeNear` and
 * `fadeFar`. Thre is some special handling for the fadeNear/fadeFar properties, which get some
 * setters and getters in a way that works well with the mixin.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class FadingFeatureMixin implements FadingFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
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
        this.needsUpdate = this.needsUpdate || value !== this.m_fadeNear;
        this.m_fadeNear = value;
        if (this.needsUpdate) {
            FadingFeature.updateDistanceFadeFeature(this);
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
        this.needsUpdate = this.needsUpdate || value !== this.m_fadeFar;
        this.m_fadeFar = value;
        if (this.needsUpdate) {
            FadingFeature.updateDistanceFadeFeature(this);
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
        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.fadeNear !== undefined) {
                this.setFadeNear(params.fadeNear);
            }
            if (params.fadeFar !== undefined) {
                this.setFadeFar(params.fadeFar);
            }
        }

        (this as any).onBeforeCompile = (shader: any) => {
            FadingFeature.onBeforeCompile(this, shader);
        };
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
     * Minimum ratio value for extrusion effect
     */
    export const DEFAULT_RATIO_MIN: number = 0.001;
    /**
     * Maximum ratio value for extrusion effect
     */
    export const DEFAULT_RATIO_MAX: number = 1;

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
        extrusionMaterial.needsUpdate = true;

        if (extrusionMaterial.defines === undefined) {
            extrusionMaterial.defines = {};
        }

        if (
            extrusionMaterial.extrusionRatio !== undefined &&
            extrusionMaterial.extrusionRatio >= ExtrusionFeature.DEFAULT_RATIO_MIN
        ) {
            // Add this define to differentiate it internally from other MeshBasicMaterial
            extrusionMaterial.defines.EXTRUSION_MATERIAL = "";
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
    export function onBeforeCompile(extrusionMaterial: ExtrusionFeature, shader: any) {
        if (extrusionMaterial.extrusionRatio === undefined) {
            return;
        }
        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.

        // Create the uniforms for the shader (if not already existing), and add the new uniforms
        // to it:
        const uniforms = shader.uniforms as UniformsType;
        uniforms.extrusionRatio = { value: extrusionMaterial.extrusionRatio };

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

    /**
     * Handles animated extrusion on each frame. Should be installed as respective
     * Object3D.onBeforeRender of meshes which use animated extusion feature.
     */
    export function addRenderHelper(object: THREE.Object3D) {
        object.onBeforeRender = chainCallbacks(
            object.onBeforeRender,
            ExtrusionFeature.onBeforeRender
        );
    }

    export function onBeforeRender(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        geometry: THREE.Geometry | THREE.BufferGeometry,
        material: THREE.Material,
        group: THREE.Group
    ) {
        const extrusionMaterial = material as ExtrusionFeature;
        const properties = renderer.properties.get(material);

        if (
            properties.shader !== undefined &&
            properties.shader.uniforms.extrusionRatio !== undefined
        ) {
            properties.shader.uniforms.extrusionRatio.value =
                extrusionMaterial.extrusionRatio || ExtrusionFeature.DEFAULT_RATIO_MAX;
            extrusionMaterial.uniformsNeedUpdate = true;
        }
    }
}

/**
 * Mixin class for extended THREE materials. Adds new properties required for `extrusionRatio`.
 * Thre is some special handling for the extrusionRatio property, which get some setters and
 * getters in a way that works well with the mixin.
 *
 * @see [[Tile#addRenderHelper]]
 */

class ExtrusionFeatureMixin implements ExtrusionFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    private m_extrusion: number = ExtrusionFeature.DEFAULT_RATIO_MAX;

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
        this.needsUpdate = this.needsUpdate || value !== this.m_extrusion;
        this.m_extrusion = value;
        if (this.needsUpdate) {
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
        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.extrusionRatio !== undefined) {
                this.setExtrusionRatio(params.extrusionRatio);
            }
        }

        (this as any).onBeforeCompile = (shader: any) => {
            ExtrusionFeature.onBeforeCompile(this, shader);
        };
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
        return ExtrusionFeature.DEFAULT_RATIO_MAX;
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
        return ExtrusionFeature.DEFAULT_RATIO_MAX;
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
