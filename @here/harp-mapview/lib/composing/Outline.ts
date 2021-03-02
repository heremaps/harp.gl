/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    EdgeMaterial,
    ExtrusionFeatureDefs,
    FadingFeature,
    MixinShaderProperties,
    UniformsType
} from "@here/harp-materials";
import { chainCallbacks } from "@here/harp-utils";
import * as THREE from "three";

import { DepthPrePassProperties } from "../DepthPrePass";

const vertexShaderChunk = `
#ifdef USE_EXTRUSION
  #ifndef HAS_EXTRUSION_PARS_VERTEX
    #include <extrusion_pars_vertex>
  #endif
#endif

#ifdef USE_FADING
  #include <fading_pars_vertex>
#endif

uniform float outlineThickness;

vec4 calculateOutline( vec4 pos, vec3 objectNormal, vec4 skinned ) {
    float thickness = outlineThickness;
    const float ratio = 1.0;
    vec4 pos2 = projectionMatrix * modelViewMatrix * vec4( skinned.xyz + objectNormal, 1.0 );
    vec4 norm = normalize( pos - pos2 );
    return pos + norm * thickness * pos.w * ratio;
}`;

const vertexShaderChunk2 = `
#if ! defined( LAMBERT ) && ! defined( PHONG ) && ! defined( TOON ) && ! defined( STANDARD )
    #ifndef USE_ENVMAP
        vec3 objectNormal = normalize( normal );
    #endif
#endif

#ifdef FLIP_SIDED
    objectNormal = -objectNormal;
#endif

#ifdef DECLARE_TRANSFORMED
    vec3 transformed = vec3( position );
#endif

#ifdef USE_EXTRUSION
 #ifndef HAS_EXTRUSION_VERTEX
  #include <extrusion_vertex>
 #endif
#endif

#ifdef USE_FADING
  #include <fading_vertex>
#endif

#ifdef USE_EXTRUSION
  gl_Position = calculateOutline( projectionMatrix * modelViewMatrix * vec4( transformed, 1.0 ),
      objectNormal, vec4( transformed, 1.0 ) );
#else
  gl_Position = calculateOutline( gl_Position, objectNormal, vec4( transformed, 1.0 ) );
#endif

#include <fog_vertex>`;

const fragmentShader = `
#include <common>
#include <fog_pars_fragment>

#ifdef USE_EXTRUSION
  #include <extrusion_pars_fragment>
#endif

#ifdef USE_FADING
  #include <fading_pars_fragment>
#endif

uniform vec3 outlineColor;
uniform float outlineAlpha;

void main() {

    gl_FragColor = vec4( outlineColor, outlineAlpha );

    #include <fog_fragment>

    #ifdef USE_EXTRUSION
      #include <extrusion_fragment>
    #endif

    #ifdef USE_FADING
      #include <fading_fragment>
    #endif
}`;

/**
 * Effect to render bold lines around extruded polygons.
 *
 * Implemented by rendering the mesh geometries with an outline material before rendering them
 * again with their original.
 */
export class OutlineEffect {
    enabled: boolean = true;

    autoClear: boolean;
    domElement: HTMLCanvasElement;
    shadowMap: THREE.WebGLShadowMap;

    private m_defaultThickness: number = 0.02;
    private readonly m_defaultColor: THREE.Color = new THREE.Color(0, 0, 0);
    private readonly m_defaultAlpha: number = 1;
    private readonly m_defaultKeepAlive: boolean = false;
    private m_ghostExtrudedPolygons: boolean = false;

    private m_cache: any = {};
    private readonly m_removeThresholdCount: number = 60;
    private m_originalMaterials: any = {};
    private m_originalOnBeforeRenders: any = {};

    private readonly m_shaderIDs: { [key: string]: string } = {
        MeshBasicMaterial: "basic",
        MeshLambertMaterial: "lambert",
        MeshPhongMaterial: "phong",
        MeshToonMaterial: "phong",
        MeshStandardMaterial: "physical",
        MeshPhysicalMaterial: "physical"
    };

    private readonly m_uniformsChunk = {
        outlineThickness: { value: this.m_defaultThickness },
        outlineColor: { value: this.m_defaultColor },
        outlineAlpha: { value: this.m_defaultAlpha }
    };

    constructor(private m_renderer: THREE.WebGLRenderer) {
        this.autoClear = m_renderer.autoClear;
        this.domElement = m_renderer.domElement;
        this.shadowMap = m_renderer.shadowMap;
    }

    set thickness(thickness: number) {
        this.m_defaultThickness = thickness;
        this.m_uniformsChunk.outlineThickness.value = thickness;
        this.m_cache = {};
    }

    set color(color: string) {
        this.m_defaultColor.set(color);
        this.m_cache = {};
    }

    set ghostExtrudedPolygons(ghost: boolean) {
        this.m_ghostExtrudedPolygons = ghost;
    }

    clear(color: boolean, depth: boolean, stencil: boolean) {
        this.m_renderer.clear(color, depth, stencil);
    }

    getPixelRatio() {
        return this.m_renderer.getPixelRatio();
    }

    setPixelRatio(value: number) {
        this.m_renderer.setPixelRatio(value);
    }

    getSize(target: THREE.Vector2) {
        return this.m_renderer.getSize(target);
    }

    setSize(width: number, height: number, updateStyle: boolean) {
        this.m_renderer.setSize(width, height, updateStyle);
    }

    setViewport(x: number, y: number, width: number, height: number) {
        this.m_renderer.setViewport(x, y, width, height);
    }

    setScissor(x: number, y: number, width: number, height: number) {
        this.m_renderer.setScissor(x, y, width, height);
    }

    setScissorTest(boolean: boolean) {
        this.m_renderer.setScissorTest(boolean);
    }

    setRenderTarget(renderTarget: THREE.WebGLRenderTarget) {
        this.m_renderer.setRenderTarget(renderTarget);
    }

    render(scene: THREE.Scene, camera: THREE.Camera) {
        // Re-rendering the scene with the outline effect enables to hide the
        // extruded polygons and show only the outlines (it is a hack and should be
        // implemented another way!).
        if (this.m_ghostExtrudedPolygons) {
            if (!this.enabled) {
                this.m_renderer.render(scene, camera);
                return;
            }

            const currentAutoClear = this.m_renderer.autoClear;
            this.m_renderer.autoClear = this.autoClear;

            this.m_renderer.render(scene, camera);

            this.m_renderer.autoClear = currentAutoClear;
        }

        this.renderOutline(scene, camera);
    }

    renderOutline(scene: THREE.Scene, camera: THREE.Camera) {
        const currentAutoClear = this.m_renderer.autoClear;
        const currentSceneAutoUpdate = scene.autoUpdate;
        const currentSceneBackground = scene.background;
        const currentShadowMapEnabled = this.m_renderer.shadowMap.enabled;

        scene.autoUpdate = false;
        scene.background = null;
        this.m_renderer.autoClear = false;
        this.m_renderer.shadowMap.enabled = false;

        scene.traverse(this.setOutlineMaterial.bind(this));

        this.m_renderer.render(scene, camera);

        scene.traverse(this.restoreOriginalMaterial.bind(this));

        this.cleanupCache();

        scene.autoUpdate = currentSceneAutoUpdate;
        scene.background = currentSceneBackground;
        this.m_renderer.autoClear = currentAutoClear;
        this.m_renderer.shadowMap.enabled = currentShadowMapEnabled;
    }

    private createInvisibleMaterial() {
        return new THREE.ShaderMaterial({ name: "invisible", visible: false });
    }

    private createMaterial(originalMaterial: THREE.Material) {
        // EdgeMaterial or depth prepass material should not be used for outlines.
        if (
            originalMaterial instanceof EdgeMaterial ||
            (originalMaterial as DepthPrePassProperties).isDepthPrepassMaterial === true
        ) {
            return this.createInvisibleMaterial();
        }

        const shaderID = this.m_shaderIDs[originalMaterial.type];
        let originalVertexShader;

        let originalUniforms: UniformsType | undefined =
            (originalMaterial as MixinShaderProperties).shaderUniforms !== undefined
                ? (originalMaterial as MixinShaderProperties).shaderUniforms
                : (originalMaterial as THREE.ShaderMaterial).uniforms;

        if (shaderID !== undefined) {
            const shader = THREE.ShaderLib[shaderID];
            originalUniforms = shader.uniforms;
            originalVertexShader = shader.vertexShader;
        } else if ((originalMaterial as any).isRawShaderMaterial === true) {
            originalVertexShader = (originalMaterial as any).vertexShader;

            if (
                !/attribute\s+vec3\s+position\s*;/.test(originalVertexShader) ||
                !/attribute\s+vec3\s+normal\s*;/.test(originalVertexShader)
            ) {
                return this.createInvisibleMaterial();
            }
        } else if ((originalMaterial as any).isShaderMaterial === true) {
            originalVertexShader = (originalMaterial as any).vertexShader;
        } else {
            return this.createInvisibleMaterial();
        }

        const isExtrusionMaterial =
            (originalMaterial as MixinShaderProperties).shaderUniforms !== undefined &&
            (originalMaterial as any).shaderUniforms.extrusionRatio !== undefined;

        const isFadingMaterial = FadingFeature.isDefined(originalMaterial as FadingFeature);

        const uniforms: UniformsType = { ...originalUniforms, ...this.m_uniformsChunk };

        const vertexShader = originalVertexShader
            // put vertexShaderChunk right before "void main() {...}"
            .replace(/void\s+main\s*\(\s*\)/, vertexShaderChunk + "\nvoid main()")
            // put vertexShaderChunk2 the end of "void main() {...}"
            // Note: here assums originalVertexShader ends with "}" of "void main() {...}"
            .replace(/\}\s*$/, vertexShaderChunk2 + "\n}")
            // remove any light related lines
            // Note: here is very sensitive to originalVertexShader
            // TODO: consider safer way
            .replace(/#include\s+<[\w_]*light[\w_]*>/g, "");

        const defines: any = {};

        if (
            !/vec3\s+transformed\s*=/.test(originalVertexShader) &&
            !/#include\s+<begin_vertex>/.test(originalVertexShader)
        ) {
            (defines as any).DECLARE_TRANSFORMED = true;
        }

        if (isExtrusionMaterial) {
            // If the original material is setup for animated extrusion (like buildings), add the
            // uniform describing the extrusion to the outline material.
            uniforms.extrusionRatio = { value: ExtrusionFeatureDefs.DEFAULT_RATIO_MIN };
            defines.USE_EXTRUSION = 1;
        }

        if (isFadingMaterial) {
            uniforms.fadeNear = {
                value:
                    originalUniforms!.fadeNear !== undefined
                        ? originalUniforms!.fadeNear.value
                        : FadingFeature.DEFAULT_FADE_NEAR
            };
            uniforms.fadeFar = {
                value:
                    originalUniforms!.fadeFar !== undefined
                        ? originalUniforms!.fadeFar.value
                        : FadingFeature.DEFAULT_FADE_FAR
            };
            defines.USE_FADING = 1;
        }

        const outlineMaterial = new THREE.ShaderMaterial({
            defines,
            uniforms,
            vertexShader,
            fragmentShader,
            side: THREE.BackSide,
            //wireframe: true,
            skinning: false,
            morphTargets: false,
            morphNormals: false,
            fog: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.SrcAlphaFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
            transparent: true,
            polygonOffset: true,
            // Extreme values used here to reduce artifacts, especially at tile borders.
            polygonOffsetFactor: 10.0,
            polygonOffsetUnits: 30.0
        });

        return outlineMaterial;
    }

    private getOutlineMaterialFromCache(originalMaterial: THREE.Material) {
        let data = this.m_cache[originalMaterial.uuid];

        if (data === undefined) {
            data = {
                material: this.createMaterial(originalMaterial),
                used: true,
                keepAlive: this.m_defaultKeepAlive,
                count: 0
            };

            this.m_cache[originalMaterial.uuid] = data;
        }

        data.used = true;

        return data.material;
    }

    private getOutlineMaterial(originalMaterial: THREE.Material) {
        const outlineMaterial = this.getOutlineMaterialFromCache(originalMaterial);

        this.m_originalMaterials[outlineMaterial.uuid] = originalMaterial;

        this.updateOutlineMaterial(outlineMaterial, originalMaterial);

        return outlineMaterial;
    }

    private setOutlineMaterial(object: THREE.Object3D) {
        if ((object as THREE.Mesh).material === undefined) {
            return;
        }

        if (Array.isArray((object as THREE.Mesh).material)) {
            for (
                let i = 0, il = ((object as THREE.Mesh).material as THREE.Material[]).length;
                i < il;
                i++
            ) {
                ((object as THREE.Mesh).material as THREE.Material[])[i] = this.getOutlineMaterial(
                    ((object as THREE.Mesh).material as THREE.Material[])[i]
                );
            }
        } else {
            (object as THREE.Mesh).material = this.getOutlineMaterial(
                (object as THREE.Mesh).material as THREE.Material
            );
        }

        this.m_originalOnBeforeRenders[object.uuid] = object.onBeforeRender;
        object.onBeforeRender = chainCallbacks(
            object.onBeforeRender,
            this.onBeforeRender.bind(this)
        );
    }

    private restoreOriginalMaterial(object: THREE.Object3D) {
        if ((object as THREE.Mesh).material === undefined) {
            return;
        }

        if (Array.isArray((object as THREE.Mesh).material)) {
            for (
                let i = 0, il = ((object as THREE.Mesh).material as THREE.Material[]).length;
                i < il;
                i++
            ) {
                ((object as THREE.Mesh).material as THREE.Material[])[i] = this.m_originalMaterials[
                    ((object as THREE.Mesh).material as THREE.Material[])[i].uuid
                ];
            }
        } else {
            (object as THREE.Mesh).material = this.m_originalMaterials[
                ((object as THREE.Mesh).material as THREE.Material).uuid
            ];
        }

        object.onBeforeRender = this.m_originalOnBeforeRenders[object.uuid];
    }

    private onBeforeRender(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        group: THREE.Group
    ) {
        const originalMaterial = this.m_originalMaterials[material.uuid];

        // just in case
        if (originalMaterial === undefined) {
            return;
        }

        this.updateUniforms(material, originalMaterial);
    }

    private updateUniforms(material: THREE.Material, originalMaterial: THREE.Material) {
        const outlineParameters = originalMaterial.userData.outlineParameters;

        const outlineUniforms = (material as THREE.ShaderMaterial).uniforms;
        outlineUniforms.outlineAlpha.value = originalMaterial.opacity;

        const originalUniforms =
            (originalMaterial as any).shaderUniforms !== undefined
                ? (originalMaterial as any).shaderUniforms
                : (originalMaterial as any).uniforms;

        if (outlineParameters !== undefined) {
            if (outlineParameters.thickness !== undefined) {
                outlineUniforms.outlineThickness.value = outlineParameters.thickness;
            }
            if (outlineParameters.color !== undefined) {
                outlineUniforms.outlineColor.value.fromArray(outlineParameters.color);
            }
            if (outlineParameters.alpha !== undefined) {
                outlineUniforms.outlineAlpha.value = outlineParameters.alpha;
            }
        }

        // If the original material is setup for animated extrusion (like buildings), update the
        // uniforms in the outline material.
        if (originalUniforms !== undefined && originalUniforms.extrusionRatio !== undefined) {
            const value = (originalMaterial as any).shaderUniforms.extrusionRatio.value;
            (material as any).extrusionRatio = value;
            (material as any).uniforms.extrusionRatio.value =
                value !== undefined ? value : ExtrusionFeatureDefs.DEFAULT_RATIO_MIN;
        }

        // Copy available fading params to the outline material.
        if (
            material.defines?.USE_FADING !== undefined &&
            originalUniforms.fadeNear !== undefined &&
            originalUniforms.fadeFar !== undefined &&
            originalUniforms.fadeFar.value >= 0.0
        ) {
            outlineUniforms.fadeNear.value = originalUniforms.fadeNear.value;
            outlineUniforms.fadeFar.value = originalUniforms.fadeFar.value;
        }
    }

    private updateOutlineMaterial(material: THREE.Material, originalMaterial: THREE.Material) {
        if (material.name === "invisible") {
            return;
        }

        const outlineParameters = originalMaterial.userData.outlineParameters;

        (material as any).skinning = (originalMaterial as any).skinning;
        (material as any).morphTargets = (originalMaterial as any).morphTargets;
        (material as any).morphNormals = (originalMaterial as any).morphNormals;
        material.fog = originalMaterial.fog;

        if (outlineParameters !== undefined) {
            material.visible =
                originalMaterial.visible === false
                    ? false
                    : outlineParameters.visible !== undefined
                    ? outlineParameters.visible
                    : true;

            if (outlineParameters.keepAlive !== undefined) {
                this.m_cache[originalMaterial.uuid].keepAlive = outlineParameters.keepAlive;
            }
        } else {
            material.visible = originalMaterial.visible;
        }

        if ((originalMaterial as any).wireframe === true || originalMaterial.depthTest === false) {
            material.visible = false;
        }
    }

    private cleanupCache() {
        let keys;

        // clear originialMaterials
        keys = Object.keys(this.m_originalMaterials);

        for (let i = 0, il = keys.length; i < il; i++) {
            this.m_originalMaterials[keys[i]] = undefined;
        }

        // clear originalOnBeforeRenders
        keys = Object.keys(this.m_originalOnBeforeRenders);

        for (let i = 0, il = keys.length; i < il; i++) {
            this.m_originalOnBeforeRenders[keys[i]] = undefined;
        }

        // remove unused outlineMaterial from cache
        keys = Object.keys(this.m_cache);

        for (const key of keys) {
            if (this.m_cache[key].used === false) {
                this.m_cache[key].count++;

                if (
                    this.m_cache[key].keepAlive === false &&
                    this.m_cache[key].count > this.m_removeThresholdCount
                ) {
                    delete this.m_cache[key];
                }
            } else {
                this.m_cache[key].used = false;
                this.m_cache[key].count = 0;
            }
        }
    }
}
