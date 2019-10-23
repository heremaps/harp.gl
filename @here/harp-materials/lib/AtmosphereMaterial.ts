/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { EarthConstants } from "@here/harp-geoutils";
import * as THREE from "three";

/**
 * `AtmosphereOuterShader`.
 *
 * Describes shading of atmosphere as seen from outer space.
 */
export const AtmosphereOuterShader: THREE.Shader = {
    uniforms: {
        darkness: { value: 0.5 },
        vCameraPos: new THREE.Uniform(new THREE.Vector3()),
        fCameraHeight: new THREE.Uniform(EarthConstants.EQUATORIAL_RADIUS * 2),
        fCameraHeight2: new THREE.Uniform(
            EarthConstants.EQUATORIAL_RADIUS * EarthConstants.EQUATORIAL_RADIUS * 2 * 2
        ),
        vLightDir: new THREE.Uniform(new THREE.Vector3(0, 0, 1)),
        vInvWavelength: new THREE.Uniform(new THREE.Vector3()),
        fOuterRadius: new THREE.Uniform(EarthConstants.EQUATORIAL_RADIUS * 1.025),
        fOuterRadius2: new THREE.Uniform(
            EarthConstants.EQUATORIAL_RADIUS * EarthConstants.EQUATORIAL_RADIUS * 1.025 * 1.025
        ),
        fInnerRadius: new THREE.Uniform(EarthConstants.EQUATORIAL_RADIUS),
        fInnerRadius2: new THREE.Uniform(
            EarthConstants.EQUATORIAL_RADIUS * EarthConstants.EQUATORIAL_RADIUS
        ),
        fKrESun: new THREE.Uniform(0.0025 * 20.0),
        fKmESun: new THREE.Uniform(0.001 * 20.0),
        fKr4PI: new THREE.Uniform(0.0025 * 4 * Math.PI),
        fKm4PI: new THREE.Uniform(0.001 * 4 * Math.PI),
        fScale: new THREE.Uniform(1.0 / (0.025 * EarthConstants.EQUATORIAL_RADIUS)),
        fScaleDepth: new THREE.Uniform(0.25),
        fScaleOverScaleDepth: new THREE.Uniform(
            (1.0 / (0.025 * EarthConstants.EQUATORIAL_RADIUS)) / 0.25
        ),
        g: new THREE.Uniform(-0.990),
        g2: new THREE.Uniform(-0.990 * -0.990)
    },
    vertexShader:
    `
        attribute vec3 position;
        uniform mat4 modelMatrix;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;

        uniform vec3 vCameraPos;            // The eye/camera position
        uniform float fCameraHeight;        // The camera's current height
        uniform float fCameraHeight2;       // fCameraHeight^2

        uniform vec3 vLightDir;      // The direction vector to the light source
        uniform vec3 vInvWavelength; // 1 / pow(wavelength, 4) for each RGB channel

        uniform float fOuterRadius;     // The outer (atmosphere) radius
        uniform float fOuterRadius2;    // fOuterRadius^2

        uniform float fInnerRadius;     // The inner (planetary) radius
        uniform float fInnerRadius2;    // fInnerRadius^2
        uniform float fKrESun;          // Kr * ESun
        uniform float fKmESun;          // Km * ESun
        uniform float fKr4PI;           // Kr * 4 * PI
        uniform float fKm4PI;           // Km * 4 * PI

        uniform float fScale;               // 1 / (fOuterRadius - fInnerRadius)
        uniform float fScaleDepth;          // The scale depth (i.e. the altitude at which the atmosphere's average density is found)
        uniform float fScaleOverScaleDepth; // fScale / fScaleDepth

        const int nSamples = 2;
        const float fSamples = 2.0;

        float scale(float fCos)
        {
            float x = 1.0 - fCos;
            return fScaleDepth * exp(-0.00287 + x*(0.459 + x*(3.83 + x*(-6.80 + x*5.25))));
        }

        varying vec3 vPrimaryColor;
        varying vec3 vSecondaryColor;
        varying vec3 vDirection;

        void main(void)
        {
            // Get the ray from the camera to the vertex and its length (which is the far point of the ray passing through the atmosphere)
            vec3 vPos = (modelMatrix * vec4(position, 1.0)).xyz; //position.xyz;
            vec3 v3CameraPos = vCameraPos;
            vec3 vRay = vPos - v3CameraPos;
            float fFar = length(vRay);
            vRay /= fFar;

            // Calculate the closest intersection of the ray with the outer atmosphere (which is the near point of the ray passing through the atmosphere)
            float B = 2.0 * dot(v3CameraPos, vRay);
            float C = fCameraHeight2 - fOuterRadius2;
            float fDet = max(0.0, B*B - 4.0 * C);
            float fNear = 0.5 * (-B - sqrt(fDet));

            // Calculate the ray's starting position, then calculate its scattering offset
            vec3 vStart = v3CameraPos + vRay * fNear;
            fFar -= fNear;
            float fStartAngle = dot(vRay, vStart) / fOuterRadius;
            float fStartDepth = exp(-1.0 / fScaleDepth);
            float fStartOffset = fStartDepth*scale(fStartAngle);

            // Initialize the scattering loop variables
            //vPrimaryColor = vec4(0.0, 0.0, 0.0, 0.0);
            float fSampleLength = fFar / fSamples;
            float fScaledLength = fSampleLength * fScale;
            vec3 vSampleRay = vRay * fSampleLength;
            vec3 vSamplePoint = vStart + vSampleRay * 0.5;

            // Now loop through the sample rays
            vec3 vFrontColor = vec3(0.0, 0.0, 0.0);
            for(int i=0; i<nSamples; i++)
            {
                float fHeight = length(vSamplePoint);
                float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fHeight));
                float fLightAngle = dot(vLightDir, vSamplePoint) / fHeight;
                float fCameraAngle = dot(vRay, vSamplePoint) / fHeight;
                float fScatter = (fStartOffset + fDepth*(scale(fLightAngle) - scale(fCameraAngle)));
                vec3 vAttenuate = exp(-fScatter * (vInvWavelength * fKr4PI + fKm4PI));
                vFrontColor += vAttenuate * (fDepth * fScaledLength);
                vSamplePoint += vSampleRay;
            }

            // Finally, scale the Mie and Rayleigh colors and set up the varying variables for the pixel shader
            vSecondaryColor.rgb = vFrontColor * fKmESun;
            vPrimaryColor.rgb = vFrontColor * (vInvWavelength * fKrESun);
            vDirection = v3CameraPos - vPos;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            //gl_Position.z = gl_Position.w;
        }
    `,

    fragmentShader:
    `
        precision highp float;
        precision highp int;

        uniform vec3 vLightDir;
        uniform float g;                    // The Mie phase asymmetry factor
        uniform float g2;                   // g * g

        varying vec3 vPrimaryColor;
        varying vec3 vSecondaryColor;
        varying vec3 vDirection;

        void main (void)
        {
            float fCos = dot(vLightDir, vDirection) / length(vDirection);
            float fMiePhase = 1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + fCos*fCos) / pow(1.0 + g2 - 2.0*g*fCos, 1.5);
            gl_FragColor.rgb = vPrimaryColor + fMiePhase * vSecondaryColor;
            gl_FragColor.a = gl_FragColor.b;
        }
    `
};

export namespace AtmosphereMaterial {
    export interface AtmosphereParams {
        nSamples: number; // Number of sample rays to use in integral equation
        Kr: number; // Rayleigh scattering constant
        Km: number; // Mie scattering constant
        ESun: number; // Sun brightness constant
        g: number; // The Mie phase asymmetry factor

        fInnerRadius: number;
        fOuterRadius: number;

        vWavelength: THREE.Vector3;

        fRayleighScaleDepth: number;
        fMieScaleDepth: number;

        readonly Kr4PI: number;
        readonly Km4PI: number;
        readonly fScale: number;
        readonly vWavelength4: THREE.Vector3;
    }

    export class AtmosphereDefaultParams implements AtmosphereParams {
        nSamples: number = 3; // Number of sample rays to use in integral equation
        Kr: number = 0.0025; // Rayleigh scattering constant
        Km: number = 0.001; // Mie scattering constant
        ESun: number = 20.0; // Sun brightness constant
        g: number = -0.99; // The Mie phase asymmetry factor

        fInnerRadius: number = EarthConstants.EQUATORIAL_RADIUS;
        fOuterRadius: number = EarthConstants.EQUATORIAL_RADIUS * 1.025;

        /**
         * 650 nm for red
         * 570 nm for green
         * 475 nm for blue
         */
        vWavelength: THREE.Vector3 = new THREE.Vector3(0.65, 0.57, 0.475);

        fRayleighScaleDepth: number = 0.25;
        fMieScaleDepth: number = 0.1;

        get Km4PI(): number {
            return this.Km * 4.0 * Math.PI;
        }
        get Kr4PI(): number {
            return this.Kr * 4.0 * Math.PI;
        }
        get fScale(): number {
            return 1 / (this.fOuterRadius - this.fInnerRadius);
        }
        get vWavelength4(): THREE.Vector3 {
            return new THREE.Vector3(
                Math.pow(this.vWavelength.x, 4.0),
                Math.pow(this.vWavelength.y, 4.0),
                Math.pow(this.vWavelength.z, 4.0)
            );
        }
    }

    /*
     * Calculate camera position used in vertex shader of atmosphere materials.
     *
     * @param camera Camera used to get the eye position.
     * @param objectInverseWorldMatrix Inverse World Matrix of the rendered atmosphere dome object.
     */
    export function getCameraInfo(
        camera: THREE.Camera,
        objectInverseWorldMatrix: THREE.Matrix4
    ): { modelViewProjection: THREE.Matrix4; eyePos: THREE.Vector3; eyeHeight: number } {
        const _projScreenMatrix = new THREE.Matrix4().copy(camera.projectionMatrix);
        const mvp = _projScreenMatrix.multiply(camera.matrixWorldInverse);
        const eyePos = new THREE.Vector3(0, 0, 0).applyMatrix4(objectInverseWorldMatrix);
        const eyeHeight = eyePos.length();

        return {
            modelViewProjection: mvp,
            eyePos,
            eyeHeight
        };
    }

    /**
     * Updates the uniform data of a material used to render an atmosphere.
     *
     * @param shaderMaterial Material which uniforms will be updated.
     * @param matrixWorldInverse Inverse of world matrix used to position the atmosphere dome.
     * @param lightDirection The light directional vector in world space.
     * @param camera Camera used in rendering.
     */
    export function updateUniforms(
        shaderMaterial: THREE.ShaderMaterial,
        matrixWorldInverse: THREE.Matrix4,
        lightDirection: THREE.Vector3,
        camera: THREE.Camera
    ): void {
        const cameraInfo = getCameraInfo(camera, matrixWorldInverse);

        if (shaderMaterial !== undefined && shaderMaterial.isMaterial) {
            if (
                shaderMaterial.uniforms &&
                //shaderMaterial.uniforms.mMvp &&
                shaderMaterial.uniforms.vCameraPos
            ) {
                //const mvp = cameraInfo.modelViewProjection;
                //shaderMaterial.uniforms.mMvp.value = new Float32Array(mvp.elements);
                shaderMaterial.uniforms.vCameraPos.value = new Float32Array(
                    cameraInfo.eyePos.toArray()
                );
                shaderMaterial.uniforms.fCameraHeight.value = cameraInfo.eyeHeight;
                shaderMaterial.uniforms.fCameraHeight2.value =
                    cameraInfo.eyeHeight * cameraInfo.eyeHeight;
                shaderMaterial.uniforms.vLightDir.value = new Float32Array(
                    lightDirection.toArray()
                );
                //console.log("Camera pos: ", JSON.stringify(cameraInfo.eyePos));
                //console.log("Camera pos: ", JSON.stringify(cameraInfo.eyeHeight));
            } else {
                throw Error("Atmosphere material has missing uniforms");
            }
        } else {
            throw Error("Wrong object used, only Material objects are supported");
        }
    }
}

/**
 * The material is used for composing.
 */
export class AtmosphereOuterMaterial extends THREE.RawShaderMaterial {
    /**
     * The constructor of `AtmosphereMaterial`.
     *
     * @param params The [[AtmosphereOuterMaterial]]'s parameters.
     */
    constructor(params?: AtmosphereMaterial.AtmosphereParams) {
        const shaderParams = {
            name: "AtmosphereOuterMaterial",
            uniforms: AtmosphereOuterShader.uniforms,
            vertexShader: AtmosphereOuterShader.vertexShader,
            fragmentShader: AtmosphereOuterShader.fragmentShader,
            //premultipliedAlpha: true,
            transparent: true,
            blending: THREE.NoBlending,
            depthTest: true,
            depthWrite: true,
            side: THREE.BackSide
        };
        super(shaderParams);

        //this.type = "AtmosphereMaterial";
        if (params !== undefined) {
            Object.keys(params).forEach((key, idx) => {
                //this.uniforms[key]
            });
        }
    }
}
