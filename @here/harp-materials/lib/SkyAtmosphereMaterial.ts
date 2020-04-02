/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";
import AtmosphereShaderChunks from "./ShaderChunks/AtmosphereChunks";
import { setShaderDefine } from "./Utils";

const EQUATORIAL_RADIUS: number = 6378137.0;

/**
 * `SkyAtmosphereShader`.
 *
 * Describes shading of atmosphere as seen from outer space.
 */
export const SkyAtmosphereShader: THREE.Shader = {
    uniforms: {
        u_eyePositionWorld: new THREE.Uniform(new THREE.Vector3()),
        u_lightDirectionWorld: new THREE.Uniform(new THREE.Vector3(0, 1, 0)),
        u_modelViewProjection: new THREE.Uniform(new THREE.Matrix4()),
        // Environment settings:
        // atmosphere inner and outer radius, camera height, light mode
        u_atmosphereEnv: new THREE.Uniform(
            new THREE.Vector4(
                // Maximum inner radius
                EQUATORIAL_RADIUS,
                // Maximum outer radius
                EQUATORIAL_RADIUS * 1.025,
                // Camera height
                0,
                // Toggles the light modes:
                // 0 - light always directly overhead,
                // 1 - lighting uses light direction: uniform u_lightDirectionWorld
                1
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
    precision highp float;
    precision highp int;

    attribute vec4 position;

    uniform mat4 u_modelViewProjection;
    uniform vec3 u_eyePositionWorld;
    uniform vec3 u_lightDirectionWorld;

    uniform vec4 u_atmosphereEnv; // Atmosphere inner and outer radius, camera height, light mode
    uniform vec3 u_hsvCorrection;

    const float Pi = 3.141592653589793;
    const float Kr = 0.0025;
    const float Kr4PI = Kr * 4.0 * Pi;
    const float Km = 0.0015;
    const float Km4PI = Km * 4.0 * Pi;
    const float ESun = 15.0; // should be 15.0
    const float KmESun = Km * ESun;
    const float KrESun = Kr * ESun;
    const vec3 InvWavelength = vec3(
        5.60204474633241,  // Red = 1.0 / Math.pow(0.650, 4.0)
        9.473284437923038, // Green = 1.0 / Math.pow(0.570, 4.0)
        19.643802610477206); // Blue = 1.0 / Math.pow(0.475, 4.0)

    const int nSamples = 2;
    const float fSamples = 2.0;

    varying vec3 v_rayleighColor;
    varying vec3 v_mieColor;
    varying vec3 v_vertToCamera;

    ${AtmosphereShaderChunks.atmosphere_common_utils}
    ${AtmosphereShaderChunks.atmosphere_vertex_utils}

    //
    // Computes rayleight and mia atmosphere factors for sky.
    //
    // Code based on GPU Gems article.
    //
    // Author: Sean O'Neil
    //
    // Copyright (c) 2004 Sean O'Neil
    //
    // https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering
    //
    // Further modifications by HERE
    //
    AtmosphereColor computeSkyAtmosphere(vec3 v3Pos, vec3 vLightDir, bool dynamicLighting)
    {
        // Unpack attributes
        float fInnerRadius = u_atmosphereEnv.x;
        float fOuterRadius = u_atmosphereEnv.y;
        float fCameraHeight = u_atmosphereEnv.z;

        // All that should be const or defines:
        float fScale = 1.0 / (fOuterRadius - fInnerRadius);
        float fScaleOverScaleDepth = (fScale / RayleighScaleDepth);
        float fCameraHeight2 = fCameraHeight * fCameraHeight;
        float fInnerRadius2 = fInnerRadius * fInnerRadius;
        float fOuterRadius2 = fOuterRadius * fOuterRadius;

        // Get the ray from the camera to the vertex and its length (which is the far point of the ray passing through the atmosphere)
        vec3 v3Ray = v3Pos - u_eyePositionWorld;
        float fFar = length(v3Ray);
        v3Ray /= fFar;

    #ifdef CAMERA_IN_SPACE

        // Calculate the closest intersection of the ray with the outer
        // atmosphere, this is the first point of the ray passing through the atmosphere dome.
        float fNear = getNearSphereIntersect(u_eyePositionWorld, v3Ray, fCameraHeight2, fOuterRadius2);
        // Make far relative to first atmosphere intersection
        fFar -= fNear;

        // Compute the ray's starting position within the atmosphere, then
        // calculate its scattering offset
        vec3 v3Start = u_eyePositionWorld + v3Ray * fNear;

        float fStartAngle = dot(v3Ray, v3Start) / fOuterRadius;
        float fStartDepth = exp(-1.0 / RayleighScaleDepth );
        float fStartOffset = fStartDepth * scale(fStartAngle);

    #else // CAMERA_IN_ATMOSPHERE

        // The ray starts already in atmosphere
        vec3 v3Start = u_eyePositionWorld;
        float height = length(v3Start);
        float depth = exp(fScaleOverScaleDepth * (fInnerRadius - fCameraHeight));
        float fStartAngle = dot(v3Ray, v3Start) / height;
        float fStartOffset = depth * scale(fStartAngle);

    #endif

        // Initialize the scattering loop variables
        float fSampleLength = fFar / fSamples;
        float fScaledLength = fSampleLength * fScale;
        vec3 v3SampleRay = v3Ray * fSampleLength;
        vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;

        // Now loop through the sample rays
        vec3 v3BaseColor = vec3(0.0);
        vec3 v3Attenuate = vec3(0.0);
        for(int i=0; i < nSamples; i++)
        {
            float height = length(v3SamplePoint);
            float depth = exp(fScaleOverScaleDepth * (fInnerRadius - height));
            float fLightAngle = dot(vLightDir, v3SamplePoint) / height;
            float fCameraAngle = dot(v3Ray, v3SamplePoint) / height;
            float fScatter = (fStartOffset + depth * (scale(fLightAngle) - scale(fCameraAngle)));
            v3Attenuate = exp(-fScatter * (InvWavelength * Kr4PI + Km4PI));
            v3BaseColor += v3Attenuate * (depth * fScaledLength);
            v3SamplePoint += v3SampleRay;
        }

        // Scale the Mie and Rayleigh colors and set up output of the function
        AtmosphereColor color;
        color.mie = v3BaseColor * KmESun;
        color.rayleigh = v3BaseColor * (InvWavelength * KrESun);
        return color;
    }

    void main(void)
    {
        float lightMode = u_atmosphereEnv.w;
        bool dynamicLight = lightMode != 0.0;

        vec3 vLightDir = conditionalBranchFree(dynamicLight,
            u_lightDirectionWorld,
            u_eyePositionWorld);
        vLightDir = normalize(vLightDir);

        AtmosphereColor atmColor = computeSkyAtmosphere(position.xyz, vLightDir, dynamicLight);
        v_mieColor = atmColor.mie;
        v_rayleighColor = atmColor.rayleigh;
        v_vertToCamera = u_eyePositionWorld - position.xyz;

        gl_Position = u_modelViewProjection * position;
    }
    `,

    fragmentShader: `
    precision highp float;
    precision highp int;

    #ifdef COLOR_CORRECT
    uniform vec3 u_hsvCorrection; // Hue, saturation, brightness
    #endif

    uniform vec4 u_atmosphereEnv; // Atmosphere inner and outer radius, camera height, light mode
    uniform vec3 u_eyePositionWorld;
    uniform vec3 u_lightDirectionWorld;

    const float g = -0.95;
    const float g2 = g * g;

    varying vec3 v_rayleighColor;
    varying vec3 v_mieColor;
    varying vec3 v_vertToCamera;

    ${AtmosphereShaderChunks.atmosphere_common_utils}
    ${AtmosphereShaderChunks.atmosphere_fragment_utils}

    void main(void)
    {
        float fInnerRadius = u_atmosphereEnv.x;
        float fOuterRadius = u_atmosphereEnv.y;
        float fCameraHeight = u_atmosphereEnv.z;
        float lightMode = u_atmosphereEnv.w;
        bool dynamicLight = lightMode != 0.0;

        vec3 vLightDir = conditionalBranchFree(dynamicLight,
            u_lightDirectionWorld,
            u_eyePositionWorld);
        vLightDir = normalize(vLightDir);

        // NOTE:
        // For better precision normalization may be added on fragment (for mobile devices)
        // while in vertex shader may be left un-normalized
        // dot(vLightDir, normalize(v_vertToCamera)) / length(v_vertToCamera);
        float cosAngle = dot(vLightDir, v_vertToCamera) / length(v_vertToCamera);
        float rayleighPhase = 0.75 * (1.0 + cosAngle * cosAngle);
        float miePhase = 1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + cosAngle * cosAngle) / pow(1.0 + g2 - 2.0 * g * cosAngle, 1.5);

        vec3 rgb = rayleighPhase * v_rayleighColor + miePhase * v_mieColor;

    #if !defined(HDR_FRAME_BUFFER)
        rgb = correctExposure(rgb, 2.0);
    #endif

    #ifdef COLOR_CORRECT
        rgb = correctColor(rgb, u_hsvCorrection);
    #endif

        // Alter alpha based on how close the viewer is to the ground (1.0 = on ground, 0.0 = at edge of atmosphere)
        float atmosphereAlpha = clamp((fOuterRadius - fCameraHeight) /
            (fOuterRadius - fInnerRadius), 0.0, 1.0);

        // Alter alpha based on time of day (0.0 = night , 1.0 = day)
        float nightAlpha = (lightMode != 0.0) ? clamp(dot(normalize(u_eyePositionWorld), vLightDir), 0.0, 1.0) : 1.0;
        atmosphereAlpha *= pow(nightAlpha, 0.5);

        gl_FragColor = vec4(rgb, mix(rgb.b, 1.0, atmosphereAlpha)); // * smoothstep(0.0, 1.0, czm_morphTime));
    }
    `
};

export class SkyAtmosphereMaterial extends THREE.RawShaderMaterial {
    constructor(params?: any) {
        // Import shader chunks
        const defines: { [key: string]: any } = {};
        defines.CAMERA_IN_SPACE = "";

        const shaderParams = {
            name: "SkyAtmosphereMaterial",
            vertexShader: SkyAtmosphereShader.vertexShader,
            fragmentShader: SkyAtmosphereShader.fragmentShader,
            uniforms: SkyAtmosphereShader.uniforms,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.NormalBlending,
            fog: false
        };
        super(shaderParams);
    }

    setDynamicLighting(enableLighting: boolean) {
        this.uniforms.u_atmosphereEnv.value.w = enableLighting ? 1.0 : 0.0;
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
     * @default [[EarthConstants.EQUATORIAL_RADIUS]].
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
     * @param shaderMaterial Material which uniforms will be updated.
     * @param matrixWorldInverse Inverse of world matrix used to position the atmosphere dome.
     * @param lightDirection The light directional vector in world space.
     * @param camera Camera used in rendering.
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
                shaderMaterial.needsUpdate = needsUpdate0 || needsUpdate1;
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
     * @param object
     * @param camera Camera used to get the eye position.
     */
    private getCameraInfo(
        object: THREE.Object3D,
        camera: THREE.Camera,
        reverse: boolean = false
    ): { modelViewProjection: THREE.Matrix4; eyePos: THREE.Vector3; eyeHeight: number } {
        if (reverse) {
            const modelMatrix = new THREE.Matrix4().identity();
            const viewMatrix = new THREE.Matrix4().getInverse(object.matrixWorld).transpose();
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
