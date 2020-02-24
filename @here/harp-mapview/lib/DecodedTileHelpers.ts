/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute,
    ColorUtils,
    Env,
    Expr,
    getPropertyValue,
    InterpolatedProperty,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isInterpolatedProperty,
    isJsonExpr,
    isShaderTechnique,
    isStandardTechnique,
    isTerrainTechnique,
    isTextureBuffer,
    parseStringEncodedColor,
    ShaderTechnique,
    Technique,
    techniqueDescriptors,
    TEXTURE_PROPERTY_KEYS,
    TextureProperties,
    TRANSPARENCY_PROPERTY_KEYS,
    Value
} from "@here/harp-datasource-protocol";
import {
    CirclePointsMaterial,
    disableBlending,
    enableBlending,
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
     * Environment used to evaluate dynamic technique attributes.
     *
     * Usually [[MapView.mapEnv]].
     */
    env: Env;

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
        // We do not support mixing vertex colors (static) and material colors (may be dynamic)
        // mixture. Vertex colors are stored in VBO and are not modifiable - some solution for
        // this problem is proposed in the HARP-8289 and PR #1164.
        // TODO: Remove when problem with substitute (vertex & material) colors will be solved.
        if (technique.vertexColors === true) {
            delete technique.color;
        }
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
        // Special case for ShaderTechnique.
        applyShaderTechniqueToMaterial(technique, material);
    } else {
        // Generic technique.
        applyTechniqueToMaterial(technique, material, options.env, options.skipExtraProps);
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
 * Allows to easy parse/encode technique's base color property value as number coded color.
 *
 * Function takes care about property parsing, interpolation and encoding if neccessary. If
 * you wish to get default value without interpolation simply ignore @param zoom when calling.
 *
 * @see ColorUtils
 * @param technique the technique where we search for base (transparency) color value
 * @param zoomLevel zoom level used for value interpolation.
 * @returns [[number]] encoded color value (in custom #TTRRGGBB) format or [[undefined]] if
 * base color property is not defined in the technique passed.
 */
export function evaluateBaseColorProperty(technique: Technique, env?: Env): number | undefined {
    const baseColorProp = getBaseColorProp(technique);
    if (baseColorProp !== undefined) {
        return evaluateColorProperty(baseColorProp, env);
    }
    return undefined;
}

/**
 * Apply [[ShaderTechnique]] parameters to material.
 *
 * @param technique the [[ShaderTechnique]] which requires special handling
 * @param material material to which technique will be applied
 */
function applyShaderTechniqueToMaterial(technique: ShaderTechnique, material: THREE.Material) {
    // The shader technique takes the argument from its `params' member.
    const params = technique.params as { [key: string]: any };
    // Remove base color and transparency properties from the processed set.
    const baseColorPropName = getBaseColorPropName(technique);
    const hasBaseColor = baseColorPropName && baseColorPropName in technique.params;
    const props = Object.getOwnPropertyNames(params).filter(propertyName => {
        // Omit base color and related transparency attributes if its defined in technique
        if (
            baseColorPropName === propertyName ||
            (hasBaseColor && TRANSPARENCY_PROPERTY_KEYS.indexOf(propertyName) !== -1)
        ) {
            return false;
        }
        const prop = propertyName as keyof typeof params;
        if (prop === "name") {
            // skip reserved property names
            return false;
        }
        return true;
    });

    // Apply all technique properties omitting base color and transparency attributes.
    props.forEach(propertyName => {
        // TODO: Check if properties values should not be interpolated, possible bug in old code!
        // This behavior is kept in the new version too, level is set to undefined.
        applyTechniquePropertyToMaterial(material, propertyName, params[propertyName]);
    });

    if (hasBaseColor) {
        const propColor = baseColorPropName as keyof THREE.Material;
        // Finally apply base color and related properties to material (opacity, transparent)
        applyBaseColorToMaterial(material, material[propColor], technique, params[propColor]);
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
 * @param zoomLevel tile zoom level for zoom-level dependent props
 * @param skipExtraProps optional, skipped props.
 */
function applyTechniqueToMaterial(
    technique: Technique,
    material: THREE.Material,
    env: Env,
    skipExtraProps?: string[]
) {
    // Remove transparent color from the firstly processed properties set.
    const baseColorPropName = getBaseColorPropName(technique);
    const hasBaseColor = baseColorPropName && baseColorPropName in technique;
    const genericProps = Object.getOwnPropertyNames(technique).filter(propertyName => {
        if (
            propertyName.startsWith("_") ||
            BASE_TECHNIQUE_NON_MATERIAL_PROPS.indexOf(propertyName) !== -1 ||
            DEFAULT_SKIP_PROPERTIES.indexOf(propertyName) !== -1 ||
            (skipExtraProps !== undefined && skipExtraProps.indexOf(propertyName) !== -1)
        ) {
            return false;
        }
        // Omit base color and related transparency attributes if its defined in technique.
        if (
            baseColorPropName === propertyName ||
            (hasBaseColor && TRANSPARENCY_PROPERTY_KEYS.indexOf(propertyName) !== -1)
        ) {
            return false;
        }
        const prop = propertyName as keyof typeof technique;
        const m = material as any;
        if (typeof m[prop] === "undefined") {
            return false;
        }
        return true;
    });

    // Apply all other properties (even colors), but not transparent (base) ones.
    genericProps.forEach(propertyName => {
        const value = technique[propertyName as keyof Technique];
        if (value !== undefined) {
            applyTechniquePropertyToMaterial(material, propertyName, value, env);
        }
    });

    // Finally apply base (possibly transparent) color itself, using blend modes to
    // provide transparency if needed.
    if (hasBaseColor) {
        applyBaseColorToMaterial(
            material,
            material[baseColorPropName as keyof THREE.Material],
            technique,
            technique[baseColorPropName as keyof Technique] as Value,
            env
        );
    }
}

/**
 * Apply single and generic technique property to corresponding material parameter.
 *
 * @note Special handling for material attributes of [[THREE.Color]] type is provided thus it
 * does not provide constructor that would take [[string]] or [[number]] values.
 *
 * @param material target material
 * @param propertyName material and technique parameter name (or index) that is to be transferred
 * @param techniqueAttrValue technique property value which will be applied to material attribute
 * @param zoomLevel optional tile zoom level.
 */
function applyTechniquePropertyToMaterial(
    material: THREE.Material,
    propertyName: string,
    techniqueAttrValue: Value,
    env?: Env
) {
    const m = material as any;
    if (m[propertyName] instanceof THREE.Color) {
        applySecondaryColorToMaterial(
            material[propertyName as keyof THREE.Material],
            techniqueAttrValue,
            env
        );
    } else {
        m[propertyName] = evaluateProperty(techniqueAttrValue, env);
    }
}

/**
 * Apply technique color to material taking special care with transparent (RGBA) colors.
 *
 * @note This function is intended to be used with secondary, triary etc. technique colors,
 * not the base ones that may contain transparency information. Such colors should be processed
 * with [[applyTechniqueBaseColorToMaterial]] function.
 *
 * @param technique an technique the applied color comes from
 * @param material the material to which color is applied
 * @param prop technique property (color) name
 * @param value color value
 * @param zoomLevel optional tile zoom level for zoom-level dependent properties are evaluated.
 */
export function applySecondaryColorToMaterial(
    materialColor: THREE.Color,
    techniqueColor: Value | Expr | InterpolatedProperty,
    env?: Env
) {
    let value = evaluateColorProperty(techniqueColor, env);

    if (ColorUtils.hasAlphaInHex(value)) {
        logger.warn("Used RGBA value for technique color without transparency support!");
        // Just for clarity remove transparency component, even if that would be ignored
        // by THREE.Color.setHex() function.
        value = ColorUtils.removeAlphaFromHex(value);
    }

    materialColor.setHex(value);
}

/**
 * Apply technique base color (transparency support) to material with modifying material opacity.
 *
 * This method applies main (or base) technique color with transparency support to the corresponding
 * material color, with an effect on entire [[THREE.Material]] __opacity__ and __transparent__
 * attributes.
 *
 * @note Transparent colors should be processed as the very last technique attributes,
 * since their effect on material properties like [[THREE.Material.opacity]] and
 * [[THREE.Material.transparent]] could be overridden by corresponding technique params.
 *
 * @param technique an technique the applied color comes from
 * @param material the material to which color is applied
 * @param prop technique property (color) name
 * @param value color value in custom number format
 * @param zoomLevel optional, tile zoom level for zoom-level dependent properties are evaluated.
 */
export function applyBaseColorToMaterial(
    material: THREE.Material,
    materialColor: THREE.Color,
    technique: Technique,
    techniqueColor: Value,
    env?: Env
) {
    const colorValue = evaluateColorProperty(techniqueColor, env);

    const { r, g, b, a } = ColorUtils.getRgbaFromHex(colorValue);
    // Override material opacity and blending by mixing technique defined opacity
    // with main color transparency
    const tech = technique as any;
    let opacity = a;
    if (tech.opacity !== undefined) {
        opacity *= evaluateProperty(tech.opacity, env);
    }

    opacity = THREE.Math.clamp(opacity, 0, 1);
    material.opacity = opacity;
    materialColor.setRGB(r, g, b);

    const opaque = opacity >= 1.0;
    if (!opaque) {
        enableBlending(material);
    } else {
        disableBlending(material);
    }
}

/**
 * Calculates the value of the technique defined property.
 *
 * Function takes care about property interpolation (when @param zoom is set) as also parsing
 * string encoded numbers.
 *
 * @note Use with care, because function does not recognize property type.
 * @param value the value of color property defined in technique
 * @param zoomLevel zoom level used for interpolation.
 */
function evaluateProperty(value: any, env?: Env): any {
    if (env !== undefined && (isInterpolatedProperty(value) || Expr.isExpr(value))) {
        value = getPropertyValue(value, env);
    }
    return value;
}

/**
 * Calculates the numerical value of the technique defined color property.
 *
 * Function takes care about color interpolation (when @param zoom is set) as also parsing
 * string encoded colors.
 *
 * @note Use with care, because function does not recognize property type.
 * @param value the value of color property defined in technique
 * @param zoomLevel zoom level used for interpolation.
 */
export function evaluateColorProperty(value: Value, env?: Env): number {
    value = evaluateProperty(value, env);

    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string") {
        const parsed = parseStringEncodedColor(value);
        if (parsed !== undefined) {
            return parsed;
        }
    }

    throw new Error(`Unsupported color format: '${value}'`);
}

/**
 * Compile expressions in techniques as they were received from decoder.
 */
export function compileTechniques(techniques: Technique[]) {
    techniques.forEach((technique: any) => {
        for (const propertyName in technique) {
            if (!technique.hasOwnProperty(propertyName)) {
                continue;
            }
            const value = technique[propertyName];
            if (isJsonExpr(value) && propertyName !== "kind") {
                // "kind" is reserved.
                try {
                    technique[propertyName] = Expr.fromJSON(value);
                } catch (error) {
                    logger.error("#compileTechniques: Failed to compile expression:", error);
                }
            }
        }
    });
}

/**
 * Allows to access base color property value for given technique.
 *
 * The color value may be encoded in [[number]], [[string]] or even as
 * [[InterpolateProperty]].
 *
 * @param technique The techniqe where we seach for base color property.
 * @returns The value of technique color used to apply transparency.
 */
function getBaseColorProp(technique: Technique): any {
    const baseColorPropName = getBaseColorPropName(technique);
    if (baseColorPropName !== undefined) {
        if (!isShaderTechnique(technique)) {
            const propColor = baseColorPropName as keyof typeof technique;
            return technique[propColor];
        } else {
            const params = technique.params as { [key: string]: any };
            const propColor = baseColorPropName as keyof typeof params;
            return params[propColor];
        }
    }
    return undefined;
}

function getBaseColorPropName(technique: Technique): string | undefined {
    const techDescriptor = techniqueDescriptors[technique.name];
    return techDescriptor !== undefined ? techDescriptor.attrTransparencyColor : undefined;
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
