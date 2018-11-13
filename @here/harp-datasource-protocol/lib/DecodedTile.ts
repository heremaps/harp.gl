/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { mercatorProjection, Projection, webMercatorProjection } from "@here/harp-geoutils";
import { HighPrecisionLineMaterial } from "@here/harp-materials";
import { applyTechniqueToMaterial, getMaterialConstructor, Technique } from "./Techniques";
import { TileInfo } from "./TileInfo";

/**
 * This object has geometry data in the form of geometries buffers ready to be used by WebGL.
 * These geometries are not `three.js` objects. They are pure data stored as `ArrayBuffer`s and
 * metadata describing these buffers.
 */
export interface DecodedTile {
    techniques: Technique[];
    geometries: Geometry[];
    textPathGeometries?: TextPathGeometry[];
    textGeometries?: TextGeometry[]; // ### deprecate
    poiGeometries?: PoiGeometry[];
    tileInfo?: TileInfo;
    decodeTime?: number; // time used to decode (in ms)

    /**
     * Tile data Copyright holder identifiers.
     *
     * `id`s should be unique. It is recommended to build them from unique identifiers like
     * registered domain names.
     *
     * @see [[CopyrightInfo]]
     */
    copyrightHolderIds?: string[];
}

/**
 * This object keeps textual data together with metadata to place it on the map.
 */
export interface TextPathGeometry {
    path: number[];
    pathLengthSqr: number;
    text: string;
    technique: number;
    featureId?: number;
}

/**
 * The data stored in Buffers' elements can be of the following elementary types: float, unsigned
 * integer (either 16-bit or 32-bit long)
 */
export type BufferElementType = "float" | "uint16" | "uint32";

/**
 * Returns an array with the data type specified as parameter.
 *
 * @param attr specifies which type of data is being stored in the array
 */
export function getArrayConstructor(attr: BufferElementType) {
    switch (attr) {
        case "float":
            return Float32Array;
        case "uint16":
            return Uint16Array;
        case "uint32":
            return Uint32Array;
    }
}

/**
 * Structured clone compliant WebGL interleaved buffer with its metadata attached.
 */
export interface InterleavedBufferAttribute {
    buffer: ArrayBufferLike;
    stride: number;
    type: BufferElementType;
    attributes: Array<{
        name: string;
        itemSize: number;
        offset: number;
    }>;
}

/**
 * Geometry types supported by [[Geometry]] objects.
 */
export enum GeometryType {
    Unspecified = 0,
    Point,
    Line,
    SolidLine,
    Text,
    TextPath,
    ExtrudedLine,
    Polygon,
    ExtrudedPolygon,
    Object3D,
    Other = 1000
}

/**
 * Structured clone compliant version of a `three.js` geometry object, consisting of buffers with
 * metadata for map features and objects for example roads, trees or parks.
 */
export interface Geometry {
    type: GeometryType;
    vertexAttributes: BufferAttribute[];
    interleavedVertexAttributes?: InterleavedBufferAttribute[];
    index?: BufferAttribute;
    edgeIndex?: BufferAttribute;
    groups: Group[];
    outlineIndicesAttributes?: BufferAttribute[];
    uuid?: string;

    /**
     * Optional list of feature IDs. Currently only `Number` is supported, will fail if features
     * have IDs with type `Long`.
     */
    featureIds?: Array<number | undefined>;

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    featureStarts?: number[];

    /**
     * Optional array of objects. It can be used to pass user data from the geometry to the mesh.
     */
    objInfos?: Array<{} | undefined>;
}

/**
 * Structured clone compliant version of a `three.js` geometry object with text to be rendered.
 * It is composed of buffers with metadata for text objects.
 */
export interface TextGeometry {
    positions: BufferAttribute;
    texts: number[];
    technique?: number;
    featureId?: number;
    stringCatalog?: Array<string | undefined>;
}

/**
 * Structured clone compliant version of a `three.js` geometry object with points of interest (POIs)
 * to be rendered. It is composed of buffers with metadata for POI objects.
 */
export interface PoiGeometry {
    positions: BufferAttribute;
    texts: number[];
    technique?: number;
    featureId?: number;
    stringCatalog?: Array<string | undefined>;
    imageTextures?: number[];
}

/**
 * Structured clone compliant WebGL buffer and its metadata.
 */
export interface BufferAttribute {
    name: string;
    buffer: ArrayBufferLike;
    type: BufferElementType;
    itemCount: number;
}

/**
 * Structured clone compliant WebGL group object and its metadata.
 * Its purpose is to make working with groups of objects easier.
 */
export interface Group {
    start: number;
    count: number;
    technique: number;
    renderOrderOffset?: number;
    featureId?: number;
}

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
 *
 * @returns new material instance that matches `technique.name`
 */
export function createMaterial(options: MaterialOptions): THREE.Material | undefined {
    const Constructor = getMaterialConstructor(options.technique);

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

    if (options.technique.id !== undefined) {
        material.name = options.technique.id;
    }

    if (options.technique.name === "extruded-polygon") {
        material.flatShading = true;
    }

    material.depthTest =
        options.technique.name === "extruded-polygon" && options.technique.depthTest !== false;

    if (options.technique.name === "shader") {
        // special case for ShaderTechnique.
        // The shader technique takes the argument from its `params' member.
        const params = options.technique.params as { [key: string]: any };
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
        applyTechniqueToMaterial(
            options.technique,
            material,
            options.level,
            options.skipExtraProps
        );
    }

    return material;
}

/**
 * Returns the projection object specified in the parameter.
 *
 * @param projectionName string describing projection to be used
 */
export function getProjection(projectionName: string): Projection | never {
    switch (projectionName) {
        case "mercator":
            return mercatorProjection;
        case "webMercator":
            return webMercatorProjection;
        default:
            throw new Error(`Unknown projection ${projectionName}`);
    } // switch
}

/**
 * String with the projection's name.
 *
 * @param projection `Projection` object containing the name of the projection to retrieve
 */
export function getProjectionName(projection: Projection): string | never {
    if (projection === mercatorProjection) {
        return "mercator";
    } else if (projection === webMercatorProjection) {
        return "webMercator";
    }
    throw new Error("Unknown projection");
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
 * This interface defines the copyright information typically used in map data.
 */
export interface CopyrightInfo {
    /**
     * Unique id of the copyright holder.
     *
     * `id`s should be unique. It is recommended to build them from unique identifiers like
     * registered domain names.
     *
     * Data sources that support copyright information may return only `id` in form: `{id: "text"}`.
     */
    id: string;

    /**
     * Copyright text to display after the copyright symbol on the map.
     */
    label?: string;

    /**
     * Optional URL pointing to further copyright information.
     */
    link?: string;

    /**
     * Optional, copyright notice year.
     */
    year?: number;
}
