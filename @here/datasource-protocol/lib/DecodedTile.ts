/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

import { mercatorProjection, Projection, webMercatorProjection } from "@here/geoutils";
import { HighPrecisionLineMaterial } from "@here/materials";
import { applyTechniqueToMaterial, getMaterialConstructor, Technique } from "./Techniques";
import { TileInfo } from "./TileInfo";

export interface DecodedTile {
    techniques: Technique[];
    geometries: Geometry[];
    textPathGeometries?: TextPathGeometry[];
    textGeometries?: TextGeometry[]; // ### deprecate
    poiGeometries?: PoiGeometry[];
    tileInfo?: TileInfo;
    decodeTime?: number; // time used to decode (in ms)
}

export interface TextPathGeometry {
    path: number[];
    pathLengthSqr: number;
    text: string;
    technique: number;
    featureId?: number;
}

export type BufferElementType = "float" | "uint16" | "uint32";

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
     * Optional array of objects. It can be used to pass userd data from the geometry to the mesh.
     */
    objInfos?: Array<{} | undefined>;
}

export interface TextGeometry {
    positions: BufferAttribute;
    texts: number[];
    technique?: number;
    featureId?: number;
    stringCatalog?: Array<string | undefined>;
}

export interface PoiGeometry {
    positions: BufferAttribute;
    texts: number[];
    technique?: number;
    featureId?: number;
    stringCatalog?: Array<string | undefined>;
    imageTextures?: number[];
}

export interface BufferAttribute {
    name: string;
    buffer: ArrayBufferLike;
    type: BufferElementType;
    itemCount: number;
}

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
     * `RawShaderMaterial` instances need to know about the fog at instanciation in order to avoid
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

export function getProjectionName(projection: Projection): string | never {
    if (projection === mercatorProjection) {
        return "mercator";
    } else if (projection === webMercatorProjection) {
        return "webMercator";
    }
    throw new Error("Unknown projection");
}

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
