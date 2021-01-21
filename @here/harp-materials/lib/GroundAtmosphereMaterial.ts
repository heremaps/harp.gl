/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

import {
    RawShaderMaterial,
    RawShaderMaterialParameters,
    RendererMaterialParameters
} from "./RawShaderMaterial";
import AtmosphereShaderChunks from "./ShaderChunks/AtmosphereChunks";
import { setShaderDefine, setShaderMaterialDefine } from "./Utils";

const EQUATORIAL_RADIUS: number = 6378137.0;

/**
 * `GroundAtmosphereShader`.
 *
 * Describes shading of atmosphere as seen from outer space.
 */
export const GroundAtmosphereShader: THREE.Shader = {
    uniforms: {
        u_eyePositionWorld: new THREE.Uniform(new THREE.Vector3()),
        u_lightDirectionWorld: new THREE.Uniform(new THREE.Vector3(0, 1, 0)),
        u_modelViewProjection: new THREE.Uniform(new THREE.Matrix4()),
        // Environment settings:
        // atmosphere inner and outer radius, camera height
        u_atmosphereEnv: new THREE.Uniform(
            new THREE.Vector3(
                // Maximum inner radius
                EQUATORIAL_RADIUS * 1.001,
                // Maximum outer radius
                EQUATORIAL_RADIUS * 1.025,
                // Camera height
                0
            )
        ),
        u_hsvCorrection: new THREE.Uniform(new THREE.Vector3(0, 0, 0)),

        topColor: new THREE.Uniform(new THREE.Color(0x0077ff)),
        bottomColor: new THREE.Uniform(new THREE.Color(0xffffff)),
        offset: new THREE.Uniform(33.0),
        exponent: new THREE.Uniform(0.6),
        fogColor: new THREE.Uniform(new THREE.Color(0x0077ff)), // scene.fog.color
        fogNear: new THREE.Uniform(new THREE.Color(0x0077ff)), // scene.fog.near
        fogFar: new THREE.Uniform(new THREE.Color(0xffffff)) // scene.fog.far
    },

    vertexShader: `

    #define IMPROVE_INTERSECT_PRECISION 1
    #define IMPROVE_DOT_PRECISION 1

    precision highp float;
    precision highp int;

    attribute vec4 position;

    // Base mandatory uniforms
    uniform mat4 u_modelViewProjection;
    uniform vec3 u_eyePositionWorld;
    uniform vec3 u_lightDirectionWorld;

    uniform vec3 u_atmosphereEnv; // Atmosphere inner and outer radius, camera height
    uniform vec3 u_hsvCorrection;

    const float Pi = 3.141592653589793;
    const float Kr = 0.0025;
    const float Km = 0.0015;
    const float Kr4PI = Kr * 4.0 * Pi;
    const float Km4PI = Km * 4.0 * Pi;
    const float ESun = 25.0; // should be 15.0
    const float KmESun = Km * ESun;
    const float KrESun = Kr * ESun;
    const vec3 InvWavelength = vec3(
        1.0 / pow(0.650, 4.0), // Red
        1.0 / pow(0.570, 4.0), // Green
        1.0 / pow(0.475, 4.0)); // Blue

    const int nSamples = 2;
    const float fSamples = 2.0;

    varying vec3 v_rayleighColor;
    varying vec3 v_mieColor;
    varying vec3 v_vertToCamera;
    varying vec3 v_vertToOrigin;

    ${AtmosphereShaderChunks.atmosphere_vertex_utils}

    //
    // Computes rayleight and mia atmosphere factors for ground.
    //
    // Code based on GPU Gems article.
    //
    // Author: Sean O'Neil
    //
    // Copyright (c) 2004 Sean O'Neil
    //
    // https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering
    //
    // Further modifications by HERE.
    //
    AtmosphereColor computeGroundAtmosphere(vec3 v3Pos, vec3 vLightDir)
    {
        // Retrieve environment variables
        float fInnerRadius = u_atmosphereEnv.x;
        float fOuterRadius = u_atmosphereEnv.y;
        float fCameraHeight = u_atmosphereEnv.z;

        // All that may be moved to const or define(s) at further optimizations:
        float fScale = 1.0 / (fOuterRadius - fInnerRadius);
        float fScaleOverScaleDepth = fScale / RayleighScaleDepth;
        float fCameraHeight2 = fCameraHeight * fCameraHeight;
        float fOuterRadius2 = fOuterRadius * fOuterRadius;

        // Get the ray from the camera to the vertex and its length (which is the far point of the ray passing through the atmosphere)
        vec3 v3Ray = v3Pos - u_eyePositionWorld;
        float fFar = length(v3Ray);
        v3Ray /= fFar;

#if !defined(IMPROVE_DOT_PRECISION)
        vec3 v3Dir = normalize(v3Pos);
#endif

#ifdef CAMERA_IN_SPACE

        // Calculate first point of camera ray and sphere intersection.
        float fNear = getNearSphereIntersect(u_eyePositionWorld, v3Ray, fCameraHeight2, fOuterRadius2);
        // Make far relative to first atmosphere intersection, setting it to
        // the length of ray passed through atmosphere
        fFar -= fNear;

        // Compute the ray's starting position within the atmosphere, then
        // calculate its scattering offset
        vec3 v3Start = u_eyePositionWorld + v3Ray * fNear;
        float fDepth = exp((fInnerRadius - fOuterRadius) / RayleighScaleDepth);

#else // CAMERA_IN_ATMOSPHERE

        // The ray starts already in atmosphere
        vec3 v3Start = u_eyePositionWorld;
        // Virtually fNear is just at eye position, so ray passing through atmosphere does not shorten
        // fFar -= 0.0;
        float fDepth = exp((fInnerRadius - fCameraHeight) / RayleighScaleDepth);
#endif

#if defined(IMPROVE_DOT_PRECISION)
        float fCameraAngle = dot(-v3Ray, v3Pos) / length(v3Pos);
#else
        float fCameraAngle = dot(-v3Ray, v3Dir);
#endif
        float fCameraScale = scale(fCameraAngle);

#ifdef DYNAMIC_LIGHT
        // When we want the atmosphere to be uniform over the globe so it is set to 1.0.
        #if defined(IMPROVE_DOT_PRECISION)
            // The light angle for given light source may be calculated as:
            // angle = dot(vLightDir, v3Dir) / length(v3Dir);
            // where v3Dir holds normalized vertex position, but for precision issues we v3Pos (un-normalized)
            float fLightAngle = dot(vLightDir, v3Pos) / length(v3Pos);
        #else
            float fLightAngle = dot(vLightDir, v3Dir);
        #endif
#else
        float fLightAngle = 1.0;
#endif
        float fLightScale = scale(fLightAngle);

        float fCameraOffset = fDepth * fCameraScale;
        float fTemp = (fLightScale + fCameraScale);

        // Initialize the scattering loop variables
        float fSampleLength = fFar / fSamples;
        float fScaledLength = fSampleLength * fScale;
        vec3 v3SampleRay = v3Ray * fSampleLength;
        vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;

        // Now loop through the sample rays
        vec3 v3BaseColor = vec3(0.0);
        vec3 v3Attenuate = vec3(0.0);
        for(int i = 0; i < nSamples; i++)
        {
            float fHeight = length(v3SamplePoint);
            float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fHeight));
            float fScatter = fDepth * fTemp - fCameraOffset;
            // Compute color factors
            v3Attenuate = exp(-fScatter * (InvWavelength * Kr4PI + Km4PI));
            v3BaseColor += v3Attenuate * (fDepth * fScaledLength);
            // Move to the next point
            v3SamplePoint += v3SampleRay;
        }

        AtmosphereColor color;
        color.mie = v3BaseColor * (InvWavelength * KrESun + KmESun);
        // Calculate the attenuation factor for the ground
        color.rayleigh = v3Attenuate;

        return color;
    }

    void main(void)
    {
        #ifdef DYNAMIC_LIGHT
            vec3 vLightDir = u_lightDirectionWorld;
        #else
            vec3 vLightDir = u_eyePositionWorld;
        #endif
        vLightDir = normalize(vLightDir);

        AtmosphereColor atmColor = computeGroundAtmosphere(position.xyz, vLightDir);
        v_mieColor = atmColor.mie;
        v_rayleighColor = atmColor.rayleigh;
        v_vertToCamera = u_eyePositionWorld - position.xyz;
        v_vertToOrigin = normalize(position.xyz);

        gl_Position = u_modelViewProjection * position;
    }
    `,

    fragmentShader: `

    // Exposure correction gives more subtle gradients on the ground.
    #define CORRECT_EXPOSURE 1
    #define FADE_DEPTH 1
    #define NIGHT_LOCAL 1

    precision highp float;
    precision highp int;

    #ifdef CORRECT_COLOR
    uniform vec3 u_hsvCorrection; // Hue, saturation, brightness
    #endif

    uniform vec3 u_atmosphereEnv; // Atmosphere inner and outer radius, camera height
    uniform vec3 u_eyePositionWorld;
    uniform vec3 u_lightDirectionWorld;

    const float g = -0.95;
    const float g2 = g * g;

    varying vec3 v_rayleighColor;
    varying vec3 v_mieColor;
    varying vec3 v_vertToCamera;
    varying vec3 v_vertToOrigin;

    ${AtmosphereShaderChunks.atmosphere_fragment_utils}

    void main(void)
    {
        float fInnerRadius = u_atmosphereEnv.x;
        float fOuterRadius = u_atmosphereEnv.y;
        float fCameraHeight = u_atmosphereEnv.z;

        #ifdef DYNAMIC_LIGHT
            vec3 vLightDir = u_lightDirectionWorld;
        #else
            vec3 vLightDir = u_eyePositionWorld;
        #endif
        vLightDir = normalize(vLightDir);

        // GPU gems mix of ground solution, with custom alpha settings
        vec3 cRgb = v_mieColor + 0.25 * v_rayleighColor;

        // Not needed for HDR frame buffer
    #if !defined(HDR_FRAME_BUFFER) && defined(CORRECT_EXPOSURE)
        // Interesting results with exposure factor: 2.0, 3.5, 4.0
        cRgb = correctExposure(cRgb, 3.0);
    #endif

    #ifdef CORRECT_COLOR
        cRgb = correctColor(cRgb, u_hsvCorrection);
    #endif

        // Base atmosphere opacity
        float fAtmosphereAlpha = 1.0;

        // Factor based on the distance of camera atmosphere and ground, results are:
        // 0.0 = camera on the ground surface,
        // 1.0 = at the outer edge of the atmosphere.
        float fDepthFactor = clamp((fCameraHeight - fInnerRadius) /
            (fOuterRadius - fInnerRadius), 0.0, 1.0);
    #ifdef FADE_DEPTH
        // Fade alpha based on the distance of camera between atmosphere layers
        #ifdef FADE_DEPTH_LINEAR
            fAtmosphereAlpha *= fDepthFactor;
        #else
            fAtmosphereAlpha *= pow(fDepthFactor, 1.5);
        #endif
    #endif

#if defined(FADE_NIGHT) || defined(DARKEN_NIGHT)
    #ifdef DYNAMIC_LIGHT
        // Adjust factor based on time of day, results are:
        // 0.0 = night,
        // 1.0 = day.
        #ifdef NIGHT_GLOBAL
            // Global night fade based on camera and light orientation
            float fNightFactor = clamp(dot(normalize(u_eyePositionWorld), vLightDir), 0.0, 1.0);
            fNightFactor = pow(fNightFactor, 0.5);
        #else // NIGHT_LOCAL
            float fNightFactor =
                clamp(dot(v_vertToOrigin, vLightDir) / length(v_vertToOrigin), 0.0, 1.0);
            fNightFactor = pow(fNightFactor, 0.8);
        #endif
    #else
        float fNightFactor = 1.0;
    #endif
#endif

    #ifdef FADE_NIGHT
        // Adjust alpha for night side of the globe
        fAtmosphereAlpha *= fNightFactor;
    #endif

    #ifdef DARKEN_NIGHT
        // Change the brightness depending on night / day side.
        // NOTE: Darkening should be rather applied in HSV space, without loss on saturation,
        // but it is much more GPU consuming.
        const float minBrightness = 0.5;
        float fDarkenFactor = clamp(fNightFactor, minBrightness, 1.0);
        cRgb *= fDarkenFactor;
    #endif

    #ifdef EXPOSURE_DEPTH
        // Control exposure depending from ground distance
        float exposureBoost = 3.0 - fDepthFactor;
        cRgb = correctExposure(cRgb, exposureBoost);
    #endif

        // Experimental fading out of focus point - similar to fresnel effect in top view.
        // This fade is handy to better expose cartographic/map features in screen center.
        float fFocusFactor = 1.0 - clamp(dot(normalize(v_vertToCamera), v_vertToOrigin), 0.0, 1.0) + 0.1;
        fFocusFactor = pow(fFocusFactor, 2.5);
        fAtmosphereAlpha *= fFocusFactor;

        // Integrate all features
        gl_FragColor = vec4(cRgb, fAtmosphereAlpha);
    }
    `
};

export interface GroundAtmosphereMaterialParameters extends RendererMaterialParameters {}

export class GroundAtmosphereMaterial extends RawShaderMaterial {
    /**
     * Constructs a new `GroundAtmosphereMaterial`.
     *
     * @param params - `GroundAtmosphereMaterial` parameters. Always required except when cloning
     * another material.
     */
    constructor(params?: GroundAtmosphereMaterialParameters) {
        let shaderParams: RawShaderMaterialParameters | undefined;
        if (params) {
            const defines: { [key: string]: any } = {};
            defines.CAMERA_IN_SPACE = "";

            shaderParams = {
                name: "GroundAtmosphereMaterial",
                vertexShader: GroundAtmosphereShader.vertexShader,
                fragmentShader: GroundAtmosphereShader.fragmentShader,
                uniforms: GroundAtmosphereShader.uniforms,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: THREE.FrontSide,
                blending: THREE.NormalBlending,
                fog: false,
                rendererCapabilities: params.rendererCapabilities
            };
        }
        super(shaderParams);
    }

    setDynamicLighting(enableLighting: boolean) {
        setShaderMaterialDefine(this, "DYNAMIC_LIGHT", enableLighting);
    }

    /**
     * Set maximum outer radius of atmosphere.
     *
     * @default [[EarthConstants.EQUATORIAL_RADIUS]] * 1.025
     */
    set outerRadius(radius: number) {
        this.uniforms.u_atmosphereEnv.value.y = radius;
    }

    get outerRadius(): number {
        return this.uniforms.u_atmosphereEnv.value.y;
    }

    /**
     * Set maximum inner radius of atmosphere.
     *
     * @default [[EarthConstants.EQUATORIAL_RADIUS]] * 1.001.
     */
    set innerRadius(radius: number) {
        this.uniforms.u_atmosphereEnv.value.x = radius;
    }

    get innerRadius(): number {
        return this.uniforms.u_atmosphereEnv.value.x;
    }

    /**
     * Updates the uniform data of a material used to render an atmosphere.
     *
     * This includes only uniforms that may change frame by frame, other uniforms are
     * accessed with convenient material setters and getters.
     *
     * @param shaderMaterial - Material which uniforms will be updated.
     * @param matrixWorldInverse - Inverse of world matrix used to position the atmosphere dome.
     * @param lightDirection - The light directional vector in world space.
     * @param camera - Camera used in rendering.
     */
    updateUniforms(
        shaderMaterial: THREE.ShaderMaterial,
        object: THREE.Object3D,
        camera: THREE.Camera,
        lightDirection: THREE.Vector3
    ): void {
        const cameraInfo = this.getCameraInfo(object, camera);

        if (shaderMaterial !== undefined && shaderMaterial.isMaterial) {
            if (
                shaderMaterial.uniforms &&
                shaderMaterial.uniforms.u_atmosphereEnv &&
                shaderMaterial.uniforms.u_hsvCorrection &&
                shaderMaterial.uniforms.u_eyePositionWorld &&
                shaderMaterial.uniforms.u_modelViewProjection &&
                shaderMaterial.uniforms.u_lightDirectionWorld
            ) {
                const eyePos = cameraInfo.eyePos;
                const mvp = cameraInfo.modelViewProjection;
                const cameraHeight = cameraInfo.eyeHeight;

                shaderMaterial.uniforms.u_eyePositionWorld.value.copy(eyePos);
                shaderMaterial.uniforms.u_modelViewProjection.value.copy(mvp);

                shaderMaterial.uniforms.u_atmosphereEnv.value.z = cameraHeight;
                shaderMaterial.uniforms.u_lightDirectionWorld.value = lightDirection.clone();

                const cameraInSpace = cameraHeight > this.outerRadius;
                const needsUpdate0 = setShaderDefine(
                    shaderMaterial.defines,
                    "CAMERA_IN_SPACE",
                    cameraInSpace
                );
                const needsUpdate1 = setShaderDefine(
                    shaderMaterial.defines,
                    "CAMERA_IN_ATMOSPHERE",
                    !cameraInSpace
                );
                shaderMaterial.needsUpdate =
                    shaderMaterial.needsUpdate || needsUpdate0 || needsUpdate1;
            } else {
                throw Error("Atmosphere material has missing uniforms");
            }
        } else {
            throw Error("Wrong object used, only Material objects are supported");
        }
    }

    /*
     * Calculate camera position used in vertex shader of atmosphere materials.
     *
     * @param object -
     * @param camera - Camera used to get the eye position.
     */
    private getCameraInfo(
        object: THREE.Object3D,
        camera: THREE.Camera,
        reverse: boolean = false
    ): { modelViewProjection: THREE.Matrix4; eyePos: THREE.Vector3; eyeHeight: number } {
        if (reverse) {
            const modelMatrix = new THREE.Matrix4().identity();
            const viewMatrix = new THREE.Matrix4().copy(object.matrixWorld).invert().transpose();
            const projectionMatrix = camera.projectionMatrix;

            const mvpMatrix = new THREE.Matrix4();
            // MVP = Projection * View * Model
            mvpMatrix.multiplyMatrices(viewMatrix, modelMatrix);
            mvpMatrix.multiplyMatrices(projectionMatrix, mvpMatrix);

            const eyePos = new THREE.Vector3();
            object.getWorldPosition(eyePos);
            const objectPos = new THREE.Vector3();
            camera.getWorldPosition(objectPos);
            const eyeHeight = objectPos.distanceTo(eyePos);

            return {
                modelViewProjection: mvpMatrix,
                eyePos,
                eyeHeight
            };
        } else {
            const modelMatrix = object.matrixWorld;
            const viewMatrix = camera.matrixWorldInverse;
            const projectionMatrix = camera.projectionMatrix;

            const mvpMatrix = new THREE.Matrix4();
            // MVP = Projection * View * Model
            mvpMatrix.multiplyMatrices(viewMatrix, modelMatrix);
            mvpMatrix.multiplyMatrices(projectionMatrix, mvpMatrix);

            const eyePos = new THREE.Vector3();
            camera.getWorldPosition(eyePos);
            const objectPos = new THREE.Vector3();
            object.getWorldPosition(objectPos);
            const eyeHeight = objectPos.distanceTo(eyePos);
            // Normally we would return simply camera position, but since camera is not moving in
            // the globe view only the world, we need to calculate eye relative to object position.
            eyePos.sub(objectPos);
            return {
                modelViewProjection: mvpMatrix,
                eyePos,
                eyeHeight
            };
        }
    }
}
