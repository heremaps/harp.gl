/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    equirectangularProjection,
    mercatorProjection,
    normalizedEquirectangularProjection,
    OrientedBox3,
    Projection,
    sphereProjection,
    Vector3Like,
    webMercatorProjection
} from "@here/harp-geoutils";
import { IndexedTechnique } from "./Techniques";
import { TileInfo } from "./TileInfo";

/**
 * This object has geometry data in the form of geometries buffers ready to be used by WebGL.
 * These geometries are not `three.js` objects. They are pure data stored as `ArrayBuffer`s and
 * metadata describing these buffers.
 */
export interface DecodedTile {
    techniques: IndexedTechnique[];
    geometries: Geometry[];
    pathGeometries?: PathGeometry[];
    textPathGeometries?: TextPathGeometry[];
    textGeometries?: TextGeometry[]; // ### deprecate
    poiGeometries?: PoiGeometry[];
    tileInfo?: TileInfo;
    maxGeometryHeight?: number;
    decodeTime?: number; // time used to decode (in ms)

    /**
     * The default bounding box in [[Tile]] is based on the geo box of the tile.
     * For data-sources that have 3d data this is not sufficient so the data-source can provide a
     * more accurate bounding box once the data is decoded.
     */
    boundingBox?: OrientedBox3;

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
 * This object keeps the path of the geometry. Space of the path depends on the
 * use case, so could be either world or local tile space.
 */
export interface PathGeometry {
    path: Vector3Like[];
}

/**
 * Attributes corresponding to some decoded geometry. It may be either a map
 * of multiple attributes or just a number with the geometry's feature id.
 */
export type AttributeMap = {} | number;

/**
 * This object keeps textual data together with metadata to place it on the map.
 */
export interface TextPathGeometry {
    path: number[];
    pathLengthSqr: number;
    text: string;
    technique: number;
    objInfos?: AttributeMap;
}

/**
 * Returns an array with the data type specified as parameter.
 *
 * @param attr specifies which type of data is being stored in the array
 */
export function getArrayConstructor(attr: BufferElementType) {
    switch (attr) {
        case "float":
            return Float32Array;
        case "uint8":
            return Uint8Array;
        case "uint16":
            return Uint16Array;
        case "uint32":
            return Uint32Array;
        case "int8":
            return Int8Array;
        case "int16":
            return Int16Array;
        case "int32":
            return Int32Array;
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
    vertexAttributes?: BufferAttribute[];
    interleavedVertexAttributes?: InterleavedBufferAttribute[];
    index?: BufferAttribute;
    edgeIndex?: BufferAttribute;
    groups: Group[];
    uuid?: string;

    /**
     * Optional list of feature start indices. The indices point into the index attribute.
     */
    featureStarts?: number[];

    /**
     * Optional array of objects. It can be used to pass user data from the geometry to the mesh.
     */
    objInfos?: AttributeMap[];
}

/**
 * The data stored in Buffers' elements can be of the following elementary types: float, signed or
 * unsigned integers (8-bit, 16-bit or 32-bit long).
 */
export type BufferElementType =
    | "float"
    | "uint8"
    | "uint16"
    | "uint32"
    | "int8"
    | "int16"
    | "int32";

/**
 * Structured clone compliant WebGL buffer and its metadata.
 */
export interface BufferAttribute {
    name: string;
    buffer: ArrayBufferLike;
    type: BufferElementType;
    itemCount: number;
    normalized?: boolean;
}

/**
 * Structured clone compliant version of a `three.js` geometry object with text to be rendered.
 * It is composed of buffers with metadata for text objects.
 */
export interface TextGeometry {
    positions: BufferAttribute;
    texts: number[];
    technique?: number;
    stringCatalog?: Array<string | undefined>;
    objInfos?: AttributeMap[];
}

/**
 * Structured clone compliant version of a `three.js` geometry object with points of interest (POIs)
 * to be rendered. It is composed of buffers with metadata for POI objects.
 */
export interface PoiGeometry {
    positions: BufferAttribute;
    texts: number[];
    /**
     * Names of the image texture or the name of the POI as indices into the array `stringCatalog`.
     */
    imageTextures?: number[];
    technique?: number;
    stringCatalog?: Array<string | undefined>;
    objInfos?: AttributeMap[];
}

/**
 * Structured clone compliant WebGL group object and its metadata.
 * Its purpose is to make working with groups of objects easier.
 */
export interface Group {
    start: number;
    count: number;
    technique: number;

    /**
     * Offset added to [[Technique]]'s [[renderOrder]] when calculating final `renderOrder` of
     * geometry object from given group.
     */
    renderOrderOffset?: number;
    featureId?: number;

    /**
     * Contains tile offsets if its [[Geometry]] has been created.
     */
    createdOffsets?: number[];
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
        case "sphere":
            return sphereProjection;
        case "normalizedEquirectangular":
            return normalizedEquirectangularProjection;
        case "equirectangular":
            return equirectangularProjection;
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
    } else if (projection === sphereProjection) {
        return "sphere";
    } else if (projection === normalizedEquirectangularProjection) {
        return "normalizedEquirectangular";
    } else if (projection === equirectangularProjection) {
        return "equirectangular";
    }
    throw new Error("Unknown projection");
}

/**
 * @returns Feature id from the provided attribute map.
 */
export function getFeatureId(attributeMap: AttributeMap | undefined): number {
    if (attributeMap === undefined) {
        return 0;
    }

    if (typeof attributeMap === "number") {
        return attributeMap;
    }

    if (attributeMap.hasOwnProperty("$id")) {
        return (attributeMap as any).$id as number;
    }

    return 0;
}
