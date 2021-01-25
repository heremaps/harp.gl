/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { GeoCoordinates } from "@here/harp-geoutils";
import { Vector2, Vector3 } from "three";

/**
 * An interface to represent polygon geometries.
 */
export interface IPolygonGeometry {
    /**
     * The rings of this polygon (specified in local webMercator space).
     */
    readonly rings: Vector2[][];
}

/**
 * An interface to represent line geometries.
 */
export interface ILineGeometry {
    /**
     * The positions of this [[ILineGeometry]] projected in local webMercator space.
     */
    readonly positions: Vector2[];

    /**
     * The positions of the original/untiled [[ILineGeometry]] in [[GeoCoordinates]].
     */
    readonly untiledPositions?: GeoCoordinates[];
}

/**
 * The [[IGeometryProcessor]] is used to process geometry features encoded in OMV tiles.
 *
 * [[OmvDecoder]] will pass to the processing methods of the concrete implementations
 * of this interface, sequences of geometries projected in the local space of the OMV
 * [[TilingScheme]] that is always defined to be an instance of [[webMercatorTilingScheme]].
 * If desired, the world positions can be converted to [[GeoCoordinates]] using the
 * [[Projection.unprojectPoint]], for example:
 *
 * ```typescript
 *        convert(geometry: ILineGeometry): GeoCoordinates[] {
 *            const projection = webMercatorTilingScheme.projection;
 *
 *            const coordinates = geometry.positions.map(worldP =>
 *                  projection.unprojectPoint(worldP));
 *
 *            return coordinates;
 *        }
 * ```
 *
 * The methods of concrete implementations of [[IGeometryProcessor]] are called to process point,
 * line and polygon geometries, see [[OmvDecoder]].
 */
export interface IGeometryProcessor {
    /**
     * The offset to apply the storage level of a tile to compute the zoom level.
     */
    storageLevelOffset?: number;

    /**
     * Process a sequence of point features.
     *
     * The points are represented as local webMercator coordinates.
     *
     * @param layerName - The name of the enclosing layer.
     * @param layerExtents - The extents of the enclosing layer.
     * @param geometry - The positions of the point features in local webMercator coordinates.
     * @param env - The environment containing the properties of the geometry.
     * @param storageLevel - The storage level of the data.
     */
    processPointFeature(
        layerName: string,
        layerExtents: number,
        geometry: Vector3[],
        env: MapEnv,
        storageLevel: number
    ): void;

    /**
     * Process a sequence of line features.
     *
     * Each line is represented as an Array of local webMercator coordinates.
     *
     * @param layerName - The name of the enclosing layer.
     * @param layerExtents - The extents of the enclosing layer.
     * @param geometry - The list of line geometries.
     * @param env - The environment containing the properties of the geometry.
     * @param storageLevel - The storage level of the data.
     */
    processLineFeature(
        layerName: string,
        layerExtents: number,
        geometry: ILineGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void;

    /**
     * Process a sequence of polygon features.
     *
     * Each polygon is represented as an Array of contour representing exterior and interior rings.
     *
     * @param layerName - The name of the enclosing layer.
     * @param layerExtents - The extents of the enclosing layer.
     * @param geometry - The list of polygons.
     * @param env - The environment containing the properties of the geometry.
     * @param storageLevel - The storage level of the data.
     */
    processPolygonFeature(
        layerName: string,
        layerExtents: number,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void;
}
