/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute,
    getPropertyValue,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isInterpolatedProperty,
    isShaderTechnique,
    isStandardTechnique,
    isTerrainTechnique,
    isTextureBuffer,
    parseStringEncodedColor,
    Technique,
    TEXTURE_PROPERTY_KEYS,
    TextureProperties
} from "@here/harp-datasource-protocol";
import {
    CirclePointsMaterial,
    HighPrecisionLineMaterial,
    MapMeshBasicMaterial,
    MapMeshStandardMaterial,
    SolidLineMaterial
} from "@here/harp-materials";
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";
import { Circles, Squares } from "./MapViewPoints";
import { toPixelFormat, toTextureDataType, toTextureFilter, toWrappingMode } from "./ThemeHelpers";

const logger = LoggerManager.instance.create("DecodedTileHelpers");

const DEFAULT_SKIP_PROPERTIES = [
    ...TEXTURE_PROPERTY_KEYS,
    "mapProperties",
    "normalMapProperties",
    "displacementMapProperties",
    "roughnessMapProperties",
    "emissiveMapProperties",
    "alphaMapProperties",
    "metalnessMapProperties",
    "bumpMapProperties"
];

/**
 * The structure of the options to pass into [[createMaterial]].
 */
export interface MaterialOptions {
    /**
     * The shader [[Technique]] to choose.
     */
    technique: Technique;

    /**
     * The active zoom level at material creation for zoom-dependent properties.
     */
    level?: number;

    /**
     * Properties to skip.
     *
     * @see [[applyTechniqueToMaterial]]
     */
    skipExtraProps?: string[];

    /**
     * `RawShaderMaterial` instances need to know about the fog at instantiation in order to avoid
     * recompiling them manually later (ThreeJS does not update fog for `RawShaderMaterial`s).
     */
    fog?: boolean;
}

/**
 * Create a material, depending on the rendering technique provided in the options.
 *
 * @param options The material options the subsequent functions need.
 * @param materialUpdateCallback Optional callback when the material gets updated,
 *                               e.g. after texture loading.
 *
 * @returns new material instance that matches `technique.name`
 */
export function createMaterial(
    options: MaterialOptions,
    textureReadyCallback?: (texture: THREE.Texture) => void
): THREE.Material | undefined {
    const technique = options.technique;
    const Constructor = getMaterialConstructor(technique);

    const settings: { [key: string]: any } = {};

    if (Constructor === undefined) {
        return undefined;
    }

    if (
        Constructor.prototype instanceof THREE.RawShaderMaterial &&
        Constructor !== HighPrecisionLineMaterial
    ) {
        settings.fog = options.fog;
    }

    const material = new Constructor(settings);

    if (technique.id !== undefined) {
        material.name = technique.id;
    }

    if (isExtrudedPolygonTechnique(technique)) {
        material.flatShading = true;
    }

    material.depthTest = isExtrudedPolygonTechnique(technique) && technique.depthTest !== false;

    if (
        isStandardTechnique(technique) ||
        isTerrainTechnique(technique) ||
        isExtrudedPolygonTechnique(technique)
    ) {
        TEXTURE_PROPERTY_KEYS.forEach((texturePropertyName: string) => {
            const textureProperty = (technique as any)[texturePropertyName];
            if (textureProperty === undefined) {
                return;
            }

            const onLoad = (texture: THREE.Texture) => {
                const properties = (technique as any)[
                    texturePropertyName + "Properties"
                ] as TextureProperties;
                if (properties !== undefined) {
                    if (properties.wrapS !== undefined) {
                        texture.wrapS = toWrappingMode(properties.wrapS);
                    }
                    if (properties.wrapT !== undefined) {
                        texture.wrapT = toWrappingMode(properties.wrapT);
                    }
                    if (properties.magFilter !== undefined) {
                        texture.magFilter = toTextureFilter(properties.magFilter);
                    }
                    if (properties.minFilter !== undefined) {
                        texture.minFilter = toTextureFilter(properties.minFilter);
                    }
                    if (properties.flipY !== undefined) {
                        texture.flipY = properties.flipY;
                    }
                    if (properties.repeatU !== undefined) {
                        texture.repeat.x = properties.repeatU;
                    }
                    if (properties.repeatV !== undefined) {
                        texture.repeat.y = properties.repeatV;
                    }
                }
                (material as any)[texturePropertyName] = texture;
                texture.needsUpdate = true;
                material.needsUpdate = true;

                if (textureReadyCallback) {
                    textureReadyCallback(texture);
                }
            };

            const onError = (error: ErrorEvent | string) => {
                logger.error("#createMaterial: Failed to load texture: ", error);
            };

            let textureUrl: string | undefined;
            if (typeof textureProperty === "string") {
                textureUrl = textureProperty;
            } else if (isTextureBuffer(textureProperty)) {
                if (textureProperty.type === "image/raw") {
                    const properties = textureProperty.dataTextureProperties;
                    if (properties !== undefined) {
                        const textureDataType: THREE.TextureDataType | undefined = properties.type
                            ? toTextureDataType(properties.type)
                            : undefined;
                        const textureBuffer = getTextureBuffer(
                            textureProperty.buffer,
                            textureDataType
                        );

                        const texture = new THREE.DataTexture(
                            textureBuffer,
                            properties.width,
                            properties.height,
                            properties.format ? toPixelFormat(properties.format) : undefined,
                            textureDataType
                        );
                        onLoad(texture);
                    } else {
                        onError("no data texture properties provided.");
                    }
                } else {
                    const textureBlob = new Blob([textureProperty.buffer], {
                        type: textureProperty.type
                    });
                    textureUrl = URL.createObjectURL(textureBlob);
                }
            }

            if (textureUrl) {
                new THREE.TextureLoader().load(
                    textureUrl,
                    onLoad,
                    undefined, // onProgress
                    onError
                );
            }
        });
    }

    if (isShaderTechnique(technique)) {
        // special case for ShaderTechnique.
        // The shader technique takes the argument from its `params' member.
        const params = technique.params as { [key: string]: any };
        Object.getOwnPropertyNames(params).forEach(property => {
            const prop = property as keyof typeof params;
            if (prop === "name") {
                // skip reserved property names
                return;
            }
            applyTechniquePropertyToMaterial(material, prop, params[prop]);
        });
    } else {
        applyTechniqueToMaterial(technique, material, options.level, options.skipExtraProps);
    }

    return material;
}

/**
 * Returns a [[THREE.BufferAttribute]] created from a provided [[BufferAttribute]] object.
 *
 * @param attribute BufferAttribute a WebGL compliant buffer
 */
export function getBufferAttribute(attribute: BufferAttribute): THREE.BufferAttribute {
    switch (attribute.type) {
        case "float":
            return new THREE.BufferAttribute(
                new Float32Array(attribute.buffer),
                attribute.itemCount
            );
        case "uint8":
            return new THREE.BufferAttribute(
                new Uint8Array(attribute.buffer),
                attribute.itemCount,
                attribute.normalized
            );
        case "uint16":
            return new THREE.BufferAttribute(
                new Uint16Array(attribute.buffer),
                attribute.itemCount,
                attribute.normalized
            );
        case "uint32":
            return new THREE.BufferAttribute(
                new Uint32Array(attribute.buffer),
                attribute.itemCount,
                attribute.normalized
            );
        case "int8":
            return new THREE.BufferAttribute(
                new Int8Array(attribute.buffer),
                attribute.itemCount,
                attribute.normalized
            );
        case "int16":
            return new THREE.BufferAttribute(
                new Int16Array(attribute.buffer),
                attribute.itemCount,
                attribute.normalized
            );
        case "int32":
            return new THREE.BufferAttribute(
                new Int32Array(attribute.buffer),
                attribute.itemCount,
                attribute.normalized
            );
        default:
            throw new Error(`unsupported buffer of type ${attribute.type}`);
    } // switch
}

/**
 * The default `three.js` object used with a specific technique.
 */
export type ObjectConstructor = new (
    geometry?: THREE.Geometry | THREE.BufferGeometry,
    material?: THREE.Material
) => THREE.Object3D;
/**
 * Gets the default `three.js` object constructor associated with the given technique.
 *
 * @param technique The technique.
 */
export function getObjectConstructor(technique: Technique): ObjectConstructor | undefined {
    if (technique.name === undefined) {
        return undefined;
    }
    switch (technique.name) {
        case "extruded-line":
        case "standard":
        case "terrain":
        case "extruded-polygon":
        case "fill":
        case "dashed-line":
        case "solid-line":
            return THREE.Mesh as ObjectConstructor;

        case "circles":
            return Circles as ObjectConstructor;
        case "squares":
            return Squares as ObjectConstructor;

        case "line":
            return THREE.LineSegments as ObjectConstructor;

        case "segments":
            return THREE.LineSegments as ObjectConstructor;

        case "shader": {
            if (!isShaderTechnique(technique)) {
                throw new Error("Invalid technique");
            }
            switch (technique.primitive) {
                case "line":
                    return THREE.Line as ObjectConstructor;
                case "segments":
                    return THREE.LineSegments as ObjectConstructor;
                case "point":
                    return THREE.Points as ObjectConstructor;
                case "mesh":
                    return THREE.Mesh as ObjectConstructor;
                default:
                    return undefined;
            }
        }

        case "text":
        case "labeled-icon":
        case "line-marker":
        case "label-rejection-line":
            return undefined;
    }
}

/**
 * Non material properties of [[BaseTechnique]]
 */
export const BASE_TECHNIQUE_NON_MATERIAL_PROPS = ["name", "id", "renderOrder", "transient"];

/**
 * Generic material type constructor.
 */
export type MaterialConstructor = new (params?: {}) => THREE.Material;

/**
 * Returns a [[MaterialConstructor]] basing on provided technique object.
 *
 * @param technique [[Technique]] object which the material will be based on.
 */
export function getMaterialConstructor(technique: Technique): MaterialConstructor | undefined {
    if (technique.name === undefined) {
        return undefined;
    }

    switch (technique.name) {
        case "extruded-line":
            if (!isExtrudedLineTechnique(technique)) {
                throw new Error("Invalid extruded-line technique");
            }
            return technique.shading === "standard"
                ? MapMeshStandardMaterial
                : MapMeshBasicMaterial;

        case "standard":
        case "terrain":
        case "extruded-polygon":
            return MapMeshStandardMaterial;

        case "dashed-line":
        case "solid-line":
            return SolidLineMaterial;

        case "fill":
            return MapMeshBasicMaterial;

        case "squares":
            return THREE.PointsMaterial;

        case "circles":
            return CirclePointsMaterial;

        case "line":
        case "segments":
            return THREE.LineBasicMaterial;

        case "shader":
            return THREE.ShaderMaterial;

        case "text":
        case "labeled-icon":
        case "line-marker":
        case "label-rejection-line":
            return undefined;
    }
}

/**
 * Apply generic technique parameters to material.
 *
 * Skips non-material [[Technique]] props:
 *  * [[BaseTechnique]] props,
 *  * `name` which is used as discriminator for technique types,
 *  * props starting with `_`
 *  * props found `skipExtraProps`
 *
 * `THREE.Color` properties are supported.
 *
 * @param technique technique from where params are copied
 * @param material target material
 * @param level optional, tile zoom level for zoom-level dependent props
 * @param skipExtraProps optional, skipped props
 */
export function applyTechniqueToMaterial(
    technique: Technique,
    material: THREE.Material,
    level?: number,
    skipExtraProps?: string[]
) {
    Object.getOwnPropertyNames(technique).forEach(propertyName => {
        if (
            propertyName.startsWith("_") ||
            BASE_TECHNIQUE_NON_MATERIAL_PROPS.indexOf(propertyName) !== -1 ||
            DEFAULT_SKIP_PROPERTIES.indexOf(propertyName) !== -1 ||
            (skipExtraProps !== undefined && skipExtraProps.indexOf(propertyName) !== -1)
        ) {
            return;
        }
        const prop = propertyName as keyof typeof technique;
        const m = material as any;
        if (typeof m[prop] === "undefined") {
            return;
        }
        let value = technique[prop];
        if (level !== undefined && isInterpolatedProperty(value)) {
            value = getPropertyValue(value, level);
        }
        applyTechniquePropertyToMaterial(material, prop, value);
    });
}

/**
 * Apply single and generic technique property to corresponding material parameter.
 *
 * @note Special handling for material parameters of `THREE.Color` type is provided thus it
 * does not provide constructor that would take [[string]] or [[number]] values.
 *
 * @param material target material
 * @param prop material parameter name (or index)
 * @param value corresponding technique property value which is applied.
 */
function applyTechniquePropertyToMaterial(
    material: THREE.Material,
    prop: string | number,
    value: any
) {
    const m = material as any;
    if (m[prop] instanceof THREE.Color) {
        if (typeof value === "string") {
            value = parseStringEncodedColor(value);
            if (value === undefined) {
                throw new Error(`Unsupported color format: '${value}'`);
            }
        }
        m[prop].set(value);
        // Trigger setter notifying change
        m[prop] = m[prop];
    } else {
        m[prop] = value;
    }
}

function getTextureBuffer(
    buffer: ArrayBuffer,
    textureDataType: THREE.TextureDataType | undefined
): THREE.TypedArray {
    if (textureDataType === undefined) {
        return new Uint8Array(buffer);
    }

    switch (textureDataType) {
        case THREE.UnsignedByteType:
            return new Uint8Array(buffer);
        case THREE.ByteType:
            return new Int8Array(buffer);
        case THREE.ShortType:
            return new Int16Array(buffer);
        case THREE.UnsignedShortType:
            return new Uint16Array(buffer);
        case THREE.IntType:
            return new Int32Array(buffer);
        case THREE.UnsignedIntType:
            return new Uint32Array(buffer);
        case THREE.FloatType:
            return new Float32Array(buffer);
        case THREE.HalfFloatType:
            return new Uint16Array(buffer);
    }

    throw new Error("Unsupported texture data type");
}
