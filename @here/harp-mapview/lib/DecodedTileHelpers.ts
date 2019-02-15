/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BufferAttribute,
    getPropertyValue,
    isExtrudedPolygonTechnique,
    isInterpolatedProperty,
    isShaderTechnique,
    isStandardTexturedTechnique,
    isTextureBuffer,
    Technique,
    toPixelFormat,
    toTextureDataType,
    toWrappingMode
} from "@here/harp-datasource-protocol";
import {
    CirclePointsMaterial,
    DashedLineMaterial,
    HighPrecisionLineMaterial,
    MapMeshBasicMaterial,
    MapMeshStandardMaterial,
    SolidLineMaterial
} from "@here/harp-materials";
import { LoggerManager } from "@here/harp-utils";
import * as THREE from "three";
import { Circles, Squares } from "./MapViewPoints";

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
    materialUpdateCallback?: () => void
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

    if (isStandardTexturedTechnique(technique) && technique.texture !== undefined) {
        const onLoad = (texture: THREE.Texture) => {
            if (technique.wrapS !== undefined) {
                texture.wrapS = toWrappingMode(technique.wrapS);
            }
            if (technique.wrapT !== undefined) {
                texture.wrapT = toWrappingMode(technique.wrapT);
            }
            if (technique.flipY !== undefined) {
                texture.flipY = technique.flipY;
            }

            (material as THREE.MeshStandardMaterial).map = texture;
            texture.needsUpdate = true;
            material.needsUpdate = true;
            if (materialUpdateCallback) {
                materialUpdateCallback();
            }
        };

        const onError = (error: ErrorEvent | string) => {
            logger.error("#createMaterial: Failed to load texture: ", error);
        };

        let textureUrl: string | undefined;
        if (typeof technique.texture === "string") {
            textureUrl = technique.texture;
        } else if (isTextureBuffer(technique.texture)) {
            if (technique.texture.type === "image/raw") {
                const properties = technique.texture.dataTextureProperties;
                if (properties !== undefined) {
                    const texture = new THREE.DataTexture(
                        technique.texture.buffer,
                        properties.width,
                        properties.height,
                        properties.format ? toPixelFormat(properties.format) : undefined,
                        properties.type ? toTextureDataType(properties.type) : undefined
                    );
                    // Technique does not support to specify filtering yet, but three.js Texture
                    // is created with linear filtering by default whereas three.js DataTexture is
                    // created with nearest by default. To be consistent also set the filtering to
                    // linear here.
                    texture.magFilter = THREE.LinearFilter;
                    texture.minFilter = THREE.LinearFilter;
                    onLoad(texture);
                } else {
                    onError("no data texture properties provided.");
                }
            } else {
                const textureBlob = new Blob([technique.texture.buffer], {
                    type: technique.texture.type
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
    }

    if (isShaderTechnique(technique)) {
        // special case for ShaderTechnique.
        // The shader technique takes the argument from its `params' member.
        const params = technique.params as { [key: string]: any };
        Object.getOwnPropertyNames(params).forEach(property => {
            const prop = property as keyof (typeof params);
            if (prop === "name") {
                // skip reserved property names
                return;
            }
            const m = material as any;
            if (m[prop] instanceof THREE.Color) {
                m[prop].set(params[prop]);
            } else {
                m[prop] = params[prop];
            }
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
        case "uint16":
            return new THREE.BufferAttribute(
                new Uint16Array(attribute.buffer),
                attribute.itemCount
            );
        case "uint32":
            return new THREE.BufferAttribute(
                new Uint32Array(attribute.buffer),
                attribute.itemCount
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
    switch (technique.name) {
        case "extruded-line":
        case "standard":
        case "standard-textured":
        case "landmark":
        case "extruded-polygon":
        case "fill":
        case "solid-line":
        case "dashed-line":
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
        case "none":
            return undefined;
    }
}

/**
 * Non material properties of [[BaseTechnique]]
 */
export const BASE_TECHNIQUE_NON_MATERIAL_PROPS = [
    "name",
    "id",
    "renderOrder",
    "renderOrderBiasProperty",
    "renderOrderBiasGroup",
    "renderOrderBiasRange",
    "transient"
];

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
    switch (technique.name) {
        case "extruded-line":
            return technique.shading === "standard"
                ? MapMeshStandardMaterial
                : MapMeshBasicMaterial;

        case "standard":
        case "standard-textured":
        case "landmark":
        case "extruded-polygon":
            return MapMeshStandardMaterial;

        case "solid-line":
            return SolidLineMaterial;

        case "dashed-line":
            return DashedLineMaterial;

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
        case "none":
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
            (skipExtraProps !== undefined && skipExtraProps.indexOf(propertyName) !== -1)
        ) {
            return;
        }
        const prop = propertyName as keyof (typeof technique);
        const m = material as any;
        let value = technique[prop];
        if (typeof m[prop] === "undefined") {
            return;
        }
        if (level !== undefined && isInterpolatedProperty<any>(value)) {
            value = getPropertyValue<any>(value, level);
        }
        if (m[prop] instanceof THREE.Color) {
            m[prop].set(value);
        } else {
            m[prop] = value;
        }
    });
}
