/*
 * Copyright (C) 2018-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute,
    ColorUtils,
    Env,
    Expr,
    getPropertyValue,
    isExtrudedLineTechnique,
    isExtrudedPolygonTechnique,
    isShaderTechnique,
    isStandardTechnique,
    isTerrainTechnique,
    isTextureBuffer,
    parseStringEncodedColor,
    ShaderTechnique,
    Technique,
    TEXTURE_PROPERTY_KEYS,
    TextureProperties,
    TRANSPARENCY_PROPERTY_KEYS,
    Value
} from "@here/harp-datasource-protocol";
import {
    getTechniqueAutomaticAttrs,
    getTechniqueDescriptor
} from "@here/harp-datasource-protocol/lib/TechniqueDescriptors";
import {
    CirclePointsMaterial,
    disableBlending,
    enableBlending,
    HighPrecisionLineMaterial,
    MapMeshBasicMaterial,
    MapMeshStandardMaterial,
    RawShaderMaterial,
    SolidLineMaterial
} from "@here/harp-materials";
import { assert, LoggerManager, pick } from "@here/harp-utils";
import * as THREE from "three";

import { DisplacedMesh } from "./geometry/DisplacedMesh";
import { SolidLineMesh } from "./geometry/SolidLineMesh";
import { MapAdapterUpdateEnv, MapMaterialAdapter, StyledProperties } from "./MapMaterialAdapter";
import { Circles, Squares } from "./MapViewPoints";
import { toPixelFormat, toTextureDataType, toTextureFilter, toWrappingMode } from "./ThemeHelpers";
import { Tile } from "./Tile";

const logger = LoggerManager.instance.create("DecodedTileHelpers");

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
     * Usually {@link MapView.env}.
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

    /**
     * Whether shadows are enabled or not, this is required because we change the material used.
     */
    shadowsEnabled?: boolean;
}

/**
 * Create a material, depending on the rendering technique provided in the options.
 *
 * @param rendererCapabilities - The capabilities of the renderer that will use the material.
 * @param options - The material options the subsequent functions need.
 * @param materialUpdateCallback - Optional callback when the material gets updated,
 *                               e.g. after texture loading.
 *
 * @returns new material instance that matches `technique.name`
 *
 * @internal
 */
export function createMaterial(
    rendererCapabilities: THREE.WebGLCapabilities,
    options: MaterialOptions,
    textureReadyCallback?: (texture: THREE.Texture) => void
): THREE.Material | undefined {
    const technique = options.technique;
    const Constructor = getMaterialConstructor(technique, options.shadowsEnabled === true);

    const settings: { [key: string]: any } = {};

    if (Constructor === undefined) {
        return undefined;
    }

    if (Constructor.prototype instanceof RawShaderMaterial) {
        settings.rendererCapabilities = rendererCapabilities;
        if (Constructor !== HighPrecisionLineMaterial) {
            settings.fog = options.fog;
        }
    }
    if (options.shadowsEnabled === true && technique.name === "fill") {
        settings.removeDiffuseLight = true;
    }

    const material = new Constructor(settings);

    if (technique.id !== undefined) {
        material.name = technique.id;
    }

    if (isExtrudedPolygonTechnique(technique)) {
        (material as MapMeshStandardMaterial).flatShading = true;
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
        MapMaterialAdapter.create(material, getMainMaterialStyledProps(technique));
    }
    return material;
}

/**
 * Returns a [[THREE.BufferAttribute]] created from a provided
 * {@link @here/harp-datasource-protocol#BufferAttribute} object.
 *
 * @param attribute - BufferAttribute a WebGL compliant buffer
 * @internal
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
 * Determines if a technique uses THREE.Object3D instances.
 * @param technique - The technique to check.
 * @returns true if technique uses THREE.Object3D, false otherwise.
 * @internal
 */
export function usesObject3D(technique: Technique): boolean {
    const name = technique.name;
    return (
        name !== undefined &&
        name !== "text" &&
        name !== "labeled-icon" &&
        name !== "line-marker" &&
        name !== "label-rejection-line"
    );
}

/**
 * Builds the object associated with the given technique.
 *
 * @param technique - The technique.
 * @param geometry - The object's geometry.
 * @param material - The object's material.
 * @param tile - The tile where the object is located.
 * @param elevationEnabled - True if elevation is enabled, false otherwise.
 *
 * @internal
 */
export function buildObject(
    technique: Technique,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    tile: Tile,
    elevationEnabled: boolean
): THREE.Object3D {
    assert(technique.name !== undefined);

    switch (technique.name) {
        case "extruded-line":
        case "standard":
        case "extruded-polygon":
        case "fill":
            return elevationEnabled
                ? new DisplacedMesh(geometry, material, () => ({
                      min: tile.elevationRange.minElevation,
                      max: tile.elevationRange.maxElevation
                  }))
                : new THREE.Mesh(geometry, material);
        case "terrain":
            return new THREE.Mesh(geometry, material);
        case "dashed-line":
        case "solid-line":
            return elevationEnabled
                ? new DisplacedMesh(
                      geometry,
                      material,
                      () => ({
                          min: tile.elevationRange.minElevation,
                          max: tile.elevationRange.maxElevation
                      }),
                      SolidLineMesh.raycast
                  )
                : new SolidLineMesh(geometry, material);

        case "circles":
            return new Circles(geometry, material);

        case "squares":
            return new Squares(geometry, material);

        case "line":
            return new THREE.LineSegments(geometry, material);

        case "segments":
            return new THREE.LineSegments(geometry, material);

        case "shader": {
            assert(isShaderTechnique(technique), "Invalid technique");

            switch (technique.primitive) {
                case "line":
                    return new THREE.Line(geometry, material);
                case "segments":
                    return new THREE.LineSegments(geometry, material);
                case "point":
                    return new THREE.Points(geometry, material);
                case "mesh":
                    return new THREE.Mesh(geometry, material);
            }
        }
    }
    assert(false, "Invalid technique");
    return new THREE.Object3D();
}

/**
 * Non material properties of `BaseTechnique`.
 * @internal
 */
export const BASE_TECHNIQUE_NON_MATERIAL_PROPS = ["name", "id", "renderOrder", "transient"];

/**
 * Generic material type constructor.
 * @internal
 */
export type MaterialConstructor = new (params: any) => THREE.Material;

/**
 * Returns a `MaterialConstructor` basing on provided technique object.
 *
 * @param technique - `Technique` object which the material will be based on.
 * @param shadowsEnabled - Whether the material can accept shadows, this is required for some
 *                         techniques to decide which material to create.
 *
 * @internal
 */
export function getMaterialConstructor(
    technique: Technique,
    shadowsEnabled: boolean
): MaterialConstructor | undefined {
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
            return shadowsEnabled ? MapMeshStandardMaterial : MapMeshBasicMaterial;

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
 * Styled properties of main material (created by [[createMaterial]]) managed by
 * [[MapObjectAdapter]].
 */
function getMainMaterialStyledProps(technique: Technique): StyledProperties {
    const automaticAttributes: any[] = getTechniqueAutomaticAttrs(technique);

    switch (technique.name) {
        case "dashed-line":
        case "solid-line": {
            const baseProps = pick(technique, automaticAttributes);
            baseProps.lineWidth = buildMetricValueEvaluator(
                technique.lineWidth ?? 0, // Compatibility: `undefined` lineWidth means hidden.
                technique.metricUnit
            );
            baseProps.outlineWidth = buildMetricValueEvaluator(
                technique.outlineWidth,
                technique.metricUnit
            );
            baseProps.dashSize = buildMetricValueEvaluator(
                technique.dashSize,
                technique.metricUnit
            );
            baseProps.gapSize = buildMetricValueEvaluator(technique.gapSize, technique.metricUnit);
            baseProps.offset = buildMetricValueEvaluator(technique.offset, technique.metricUnit);
            return baseProps;
        }
        case "fill":
            return pick(technique, automaticAttributes);
        case "standard":
        case "terrain":
        case "extruded-polygon": {
            const baseProps = pick(technique, automaticAttributes);
            if (technique.vertexColors !== true) {
                baseProps.color = technique.color;
            }
            return baseProps;
        }
        case "circles":
        case "squares":
            return pick(technique, automaticAttributes);
        case "extruded-line":
            return pick(technique, [
                "color",
                "wireframe",
                "transparent",
                "opacity",
                "polygonOffset",
                "polygonOffsetFactor",
                "polygonOffsetUnits",
                ...automaticAttributes
            ]);
        case "line":
        case "segments":
            return pick(technique, automaticAttributes);
        default:
            return {};
    }
}

/**
 * Convert metric style property to expression that accounts {@link MapView.pixelToWorld} if
 * `metricUnit === 'Pixel'`.
 * @internal
 */
export function buildMetricValueEvaluator(
    value: Expr | Value | undefined,
    metricUnit: string | undefined
) {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value === "string") {
        if (value.endsWith("px")) {
            metricUnit = "Pixel";
            value = Number.parseFloat(value);
        } else if (value.endsWith("m")) {
            value = Number.parseFloat(value);
        }
    }
    if (metricUnit === "Pixel") {
        return (context: MapAdapterUpdateEnv) => {
            const pixelToWorld = (context.env.lookup("$pixelToMeters") as number) ?? 1;
            const evaluated = getPropertyValue(value, context.env);
            return pixelToWorld * evaluated;
        };
    } else {
        return value;
    }
}

/**
 * Allows to easy parse/encode technique's base color property value as number coded color.
 *
 * @remarks
 * Function takes care about property parsing, interpolation and encoding if neccessary.
 *
 * @see ColorUtils
 * @param technique - the technique where we search for base (transparency) color value
 * @param env - {@link @here/harp-datasource-protocol#Env} instance
 *              used to evaluate {@link @here/harp-datasource-protocol#Expr}
 *              based properties of `Technique`
 * @returns `number` encoded color value (in custom #TTRRGGBB) format or `undefined` if
 * base color property is not defined in the technique passed.
 *
 * @internal
 */
export function evaluateBaseColorProperty(technique: Technique, env: Env): number | undefined {
    const baseColorProp = getBaseColorProp(technique);
    if (baseColorProp !== undefined) {
        return evaluateColorProperty(baseColorProp, env);
    }
    return undefined;
}

/**
 * Apply `ShaderTechnique` parameters to material.
 *
 * @param technique - the `ShaderTechnique` which requires special handling
 * @param material - material to which technique will be applied
 *
 * @internal
 */
function applyShaderTechniqueToMaterial(technique: ShaderTechnique, material: THREE.Material) {
    if (technique.transparent) {
        enableBlending(material);
    } else {
        disableBlending(material);
    }

    // The shader technique takes the argument from its `params' member.
    const params = technique.params as { [key: string]: any };
    // Remove base color and transparency properties from the processed set.
    const baseColorPropName = getBaseColorPropName(technique);
    const hasBaseColor = baseColorPropName && baseColorPropName in technique.params;
    const props = Object.getOwnPropertyNames(params).filter(propertyName => {
        // Omit base color and related transparency attributes if its defined in technique
        if (
            baseColorPropName === propertyName ||
            (hasBaseColor && TRANSPARENCY_PROPERTY_KEYS.includes(propertyName))
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
 * Apply single and generic technique property to corresponding material parameter.
 *
 * @note Special handling for material attributes of [[THREE.Color]] type is provided thus it
 * does not provide constructor that would take [[string]] or [[number]] values.
 *
 * @param material - target material
 * @param propertyName - material and technique parameter name (or index) that is to be transferred
 * @param techniqueAttrValue - technique property value which will be applied to material attribute
 * @param env - {@link @here/harp-datasource-protocol#Env} instance used
 *              to evaluate {@link @here/harp-datasource-protocol#Expr}
 *              based properties of [[Technique]]
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
        const value = evaluateProperty(techniqueAttrValue, env);
        if (value !== null) {
            m[propertyName] = value;
        }
    }
}

/**
 * Apply technique color to material taking special care with transparent (RGBA) colors.
 *
 * @remarks
 * @note This function is intended to be used with secondary, triary etc. technique colors,
 * not the base ones that may contain transparency information. Such colors should be processed
 * with [[applyTechniqueBaseColorToMaterial]] function.
 *
 * @param technique - an technique the applied color comes from
 * @param material - the material to which color is applied
 * @param prop - technique property (color) name
 * @param value - color value
 * @param env - {@link @here/harp-datasource-protocol#Env} instance used
 *              to evaluate {@link @here/harp-datasource-protocol#Expr}
 *              based properties of `Technique`.
 *
 * @internal
 */
export function applySecondaryColorToMaterial(
    materialColor: THREE.Color,
    techniqueColor: Value | Expr,
    env?: Env
) {
    let value = evaluateColorProperty(techniqueColor, env);
    if (value === undefined) {
        return;
    }
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
 * @remarks
 * This method applies main (or base) technique color with transparency support to the corresponding
 * material color, with an effect on entire [[THREE.Material]] __opacity__ and __transparent__
 * attributes.
 *
 * @note Transparent colors should be processed as the very last technique attributes,
 * since their effect on material properties like [[THREE.Material.opacity]] and
 * [[THREE.Material.transparent]] could be overridden by corresponding technique params.
 *
 * @param technique - an technique the applied color comes from
 * @param material - the material to which color is applied
 * @param prop - technique property (color) name
 * @param value - color value in custom number format
 * @param env - {@link @here/harp-datasource-protocol#Env} instance used to evaluate
 *              {@link @here/harp-datasource-protocol#Expr} based properties of [[Technique]]
 *
 * @internal
 */
export function applyBaseColorToMaterial(
    material: THREE.Material,
    materialColor: THREE.Color,
    technique: Technique,
    techniqueColor: Value,
    env?: Env
) {
    const colorValue = evaluateColorProperty(techniqueColor, env);
    if (colorValue === undefined) {
        return;
    }

    const { r, g, b, a } = ColorUtils.getRgbaFromHex(colorValue);
    // Override material opacity and blending by mixing technique defined opacity
    // with main color transparency
    const tech = technique as any;
    let opacity = a;
    if (tech.opacity !== undefined) {
        opacity *= evaluateProperty(tech.opacity, env);
    }

    opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    if (material instanceof RawShaderMaterial) {
        material.setOpacity(opacity);
    } else {
        material.opacity = opacity;
    }

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
 * Function takes care about property interpolation (when @param `env` is set) as also parsing
 * string encoded numbers.
 *
 * @note Use with care, because function does not recognize property type.
 * @param value - the value of color property defined in technique
 * @param env - {@link @here/harp-datasource-protocol#Env} instance used to evaluate
 *              {@link @here/harp-datasource-protocol#Expr} based properties of [[Technique]]
 */
function evaluateProperty(value: any, env?: Env): any {
    if (env !== undefined && Expr.isExpr(value)) {
        value = getPropertyValue(value, env);
    }
    return value;
}

/**
 * Calculates the numerical value of the technique defined color property.
 *
 * @remarks
 * Function takes care about color interpolation (when @param `env is set) as also parsing
 * string encoded colors.
 *
 * @note Use with care, because function does not recognize property type.
 * @param value - the value of color property defined in technique
 * @param env - {@link @here/harp-datasource-protocol#Env} instance used to evaluate
 *              {@link @here/harp-datasource-protocol#Expr} based properties of [[Technique]]
 * @internal
 */
export function evaluateColorProperty(value: Value, env?: Env): number | undefined {
    value = evaluateProperty(value, env);

    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string") {
        const parsed = parseStringEncodedColor(value);
        if (parsed !== undefined) {
            return parsed;
        }
    }

    logger.error(`Unsupported color format: '${value}'`);
    return undefined;
}

/**
 * Allows to access base color property value for given technique.
 *
 * The color value may be encoded in [[number]], [[string]] or even as
 * [[InterpolateProperty]].
 *
 * @param technique - The techniqe where we seach for base color property.
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
    return getTechniqueDescriptor(technique)?.attrTransparencyColor;
}

function getTextureBuffer(
    buffer: ArrayBuffer,
    textureDataType: THREE.TextureDataType | undefined
): BufferSource {
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
