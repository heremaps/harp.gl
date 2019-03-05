/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { Light, PixelFormat, TextureDataType, WrappingMode } from "@here/harp-datasource-protocol";

/**
 * Returns `three.js` pixel format object basing on a [[PixelFormat]] specified.
 */
export function toPixelFormat(format: PixelFormat): THREE.PixelFormat {
    if (format === "Alpha") {
        return THREE.AlphaFormat;
    } else if (format === "RGB") {
        return THREE.RGBFormat;
    } else if (format === "RGBA") {
        return THREE.RGBAFormat;
    } else if (format === "Luminance") {
        return THREE.LuminanceFormat;
    } else if (format === "LuminanceAlpha") {
        return THREE.LuminanceAlphaFormat;
    } else if (format === "RGBE") {
        return THREE.RGBEFormat;
    } else if (format === "Depth") {
        return THREE.DepthFormat;
    } else if (format === "DepthStencil") {
        return THREE.DepthStencilFormat;
    }
    throw new Error(`invalid pixel format: ${format}`);
}

/**
 * Returns `three.js` texture data types based on a [[TextureDataType]] specified.
 */
export function toTextureDataType(dataType: TextureDataType): THREE.TextureDataType {
    if (dataType === "UnsignedByte") {
        return THREE.UnsignedByteType;
    } else if (dataType === "Byte") {
        return THREE.ByteType;
    } else if (dataType === "Short") {
        return THREE.ShortType;
    } else if (dataType === "UnsignedShort") {
        return THREE.UnsignedShortType;
    } else if (dataType === "Int") {
        return THREE.IntType;
    } else if (dataType === "UnsignedInt") {
        return THREE.UnsignedIntType;
    } else if (dataType === "Float") {
        return THREE.FloatType;
    } else if (dataType === "HalfFloat") {
        return THREE.HalfFloatType;
    }
    throw new Error(`invalid texture data type: ${dataType}`);
}

/**
 * Returns `three.js` wrapping mode object basing on a [[WrappingMode]] specified.
 */
export function toWrappingMode(mode: WrappingMode): THREE.Wrapping {
    if (mode === "clamp") {
        return THREE.ClampToEdgeWrapping;
    } else if (mode === "repeat") {
        return THREE.RepeatWrapping;
    } else if (mode === "mirror") {
        return THREE.MirroredRepeatWrapping;
    }
    throw new Error(`invalid wrapping: ${mode}`);
}

/**
 * Create a specific light for lightening the map.
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
