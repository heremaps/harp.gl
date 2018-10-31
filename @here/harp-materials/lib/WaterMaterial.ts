/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import { LoggerManager } from "@here/harp-utils";
const logger = LoggerManager.instance.create("WaterMaterial");

import * as THREE from "three";

const vertexSource: string = `
attribute vec3 position;
attribute vec2 uv;
//attribute vec2 geos;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec2 vUv;
//varying vec2 vGeos;

void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    vUv = uv;

    //vUv.x = (gl_Position.x / gl_Position.w + 1.0) / 2.0;
    //vUv.y = (gl_Position.y / gl_Position.w + 1.0) / 2.0;
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

uniform sampler2D tex;
uniform float t;

varying vec2 vUv;
//varying vec2 vGeos;

void main() {
    vec4 noiseColor = texture2D(tex, vUv.xy);

    //gl_FragColor = vec4( 1.0, 0.0, 1.0, 1.0 );
    //vec4 color = vec4( vUv.xy, 1.0, 1.0 );
    //gl_FragColor = color * 0.5 * (1.0 - t) + vec4( 0.0, 0.0, 1.0, 1.0 ) * 0.5 * t;
    //gl_FragColor = mix(color, vec4(0.0, 0.0, 1.0, 1.0), (sin(t) + 1.0) / 2.0);

    //vec4 color1 = vec4(0.239, 0.498, 0.662, 1.0);
    //vec4 color2 = vec4(0.184, 0.447, 0.713, 1.0);

    vec4 color1 = vec4(20.0/255.0, 194.0/255.0, 252.0/255.0, 1.0);
    vec4 color2 = vec4(29.0/255.0, 91.0/255.0, 112.0/255.0, 1.0);

    //gl_FragColor = mix(color1, color2, (sin(t + noiseColor.r * 5.0) + 1.0) / 2.0);

    gl_FragColor = mix(color1, color2, (sin(noiseColor.r + noiseColor.r * noiseColor.r * t * 5.0) + 1.0) / 2.0);
}`;

/**
 * Parameters used when constructing a new [[WaterMaterial]].
 */
export interface WaterMaterialParameters {
}


let waterTextureIsLoaded = false;
const waterTextureLoader = new THREE.TextureLoader();
let sharedTexture: THREE.Texture = THREE.Texture.DEFAULT_IMAGE;
let t = 0;

const shaderParams = {
    name: "WaterMaterial",
    vertexShader: vertexSource,
    fragmentShader: fragmentSource,
    uniforms: {
        tex: new THREE.Uniform(sharedTexture),
        t: new THREE.Uniform(t)
    },
    depthWrite: false
};

function LoadSharedTextureIfNeeded()
{
    if (! waterTextureIsLoaded)
    {
        const texturePath = "resources/noise.png";
        logger.log("Loading water texture", texturePath, "...")
        waterTextureLoader.load(
            texturePath,
            //"resources/fonts/Default_Assets/FiraGO_Map/Latin-1_Supplement.png",
            tex => {
                sharedTexture = tex;
                shaderParams.uniforms.tex = new THREE.Uniform(sharedTexture);
                logger.log("Water texture loaded.");
            }
        );
        waterTextureIsLoaded = true;
    }
}

export function UpdateWaterMaterial()
{
    t += 0.1;
    //if (t > 1.0) {
    //    t -= 1.0;
    //}
    shaderParams.uniforms.t = new THREE.Uniform(t);
}


/**
 * Material designed to render the edges of extruded buildings using GL_LINES. It supports solid
 * colors, vertex colors, color mixing and distance fading.
 */
export class WaterMaterial extends THREE.RawShaderMaterial {
    /**
     * Constructs a new `WaterMaterial`.
     *
     * @param params `WaterMaterial` parameters.
     */
    constructor(params?: WaterMaterialParameters) {
        LoadSharedTextureIfNeeded();
        super(shaderParams);
    }
}
