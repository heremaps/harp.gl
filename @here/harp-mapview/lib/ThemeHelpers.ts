/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Light,
    MagFilter,
    MinFilter,
    PixelFormat,
    TextureDataType,
    WrappingMode
} from "@here/harp-datasource-protocol";
import * as THREE from "three";

/**
 * Returns `three.js` pixel format object basing on a [[PixelFormat]] specified.
 */
export function toPixelFormat(format: PixelFormat): THREE.PixelFormat {
    switch (format) {
        case "Alpha":
            return THREE.AlphaFormat;
        case "RGB":
            return THREE.RGBFormat;
        case "RGBA":
            return THREE.RGBAFormat;
        case "Luminance":
            return THREE.LuminanceFormat;
        case "LuminanceAlpha":
            return THREE.LuminanceAlphaFormat;
        case "RGBE":
            return THREE.RGBEFormat;
        case "Depth":
            return THREE.DepthFormat;
        case "DepthStencil":
            return THREE.DepthStencilFormat;
        case "Red":
            return THREE.RedFormat;
        default:
            throw new Error(`invalid pixel format: ${format}`);
    }
}

/**
 * Returns `three.js` texture data types based on a [[TextureDataType]] specified.
 */
export function toTextureDataType(dataType: TextureDataType): THREE.TextureDataType {
    switch (dataType) {
        case "UnsignedByte":
            return THREE.UnsignedByteType;
        case "Byte":
            return THREE.ByteType;
        case "Short":
            return THREE.ShortType;
        case "UnsignedShort":
            return THREE.UnsignedShortType;
        case "Int":
            return THREE.IntType;
        case "UnsignedInt":
            return THREE.UnsignedIntType;
        case "Float":
            return THREE.FloatType;
        case "HalfFloat":
            return THREE.HalfFloatType;
        default:
            throw new Error(`invalid texture data type: ${dataType}`);
    }
}

/**
 * Returns `three.js` wrapping mode object based on a [[WrappingMode]] specified.
 */
export function toWrappingMode(mode: WrappingMode): THREE.Wrapping {
    switch (mode) {
        case "clamp":
            return THREE.ClampToEdgeWrapping;
        case "repeat":
            return THREE.RepeatWrapping;
        case "mirror":
            return THREE.MirroredRepeatWrapping;
        default:
            throw new Error(`invalid wrapping mode: ${mode}`);
    }
}

/**
 * Returns `three.js` texture filter object based on a [[MagFilter]] or [[MinFilter]] specified.
 */
export function toTextureFilter(filter: MagFilter | MinFilter): THREE.TextureFilter {
    switch (filter) {
        case "nearest":
            return THREE.NearestFilter;
        case "nearestMipMapNearest":
            return THREE.NearestMipMapNearestFilter;
        case "nearestMipMapLinear":
            return THREE.NearestMipMapLinearFilter;
        case "linear":
            return THREE.LinearFilter;
        case "linearMipMapNearest":
            return THREE.LinearMipMapNearestFilter;
        case "linearMipMapLinear":
            return THREE.LinearMipMapLinearFilter;
        default:
            throw new Error(`invalid texture filter: ${filter}`);
    }
}

/**
 * Create a specific light for lighting the map.
 */
export function createLight(lightDescription: Light): THREE.Light {
    switch (lightDescription.type) {
        case "ambient": {
            const light = new THREE.AmbientLight(
                lightDescription.color,
                lightDescription.intensity
            );
            light.name = lightDescription.name;
            return light;
        }
        case "directional": {
            const light = new THREE.DirectionalLight(
                lightDescription.color,
                lightDescription.intensity
            );
            light.name = lightDescription.name;
            if (lightDescription.castShadow !== undefined) {
                light.castShadow = lightDescription.castShadow;
            }
            if (light.castShadow) {
                light.shadow.bias = 0.00001;
                light.shadow.mapSize.width = 1024;
                light.shadow.mapSize.height = 1024;
            }
            light.position.set(
                lightDescription.direction.x,
                lightDescription.direction.y,
                lightDescription.direction.z
            );
            light.position.normalize();
            return light;
        }
    }
}
