/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueMap } from "@here/harp-datasource-protocol/index-decoder";
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
 * The [[IGeometryProcessor]] is used to process geometry features from vector tiles.
 *
 * [[VectorTileDecoder]] will pass to this interface implementation sequences of geometries
 * projected in webMercator local tile space (coordinates relative to tile's north-east corner).
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
 * line and polygon geometries, see [[VectorTileDecoder]].
 */
export interface IGeometryProcessor {
    /**
     * Process a sequence of point features.
     *
     * The points are represented as local webMercator coordinates (coordinates relative to
     * tile's north-east corner).
     *
     * @param layerName - The name of the enclosing layer.
     * @param tileExtents - The tile size (north to south, east to west) in webMercator.
     * @param geometry - The positions of the point features in local webMercator coordinates.
     * @param properties - The geometry properties.
     * @param featureId - The feature identifier.
     */
    processPointFeature(
        layerName: string,
        tileExtents: number,
        geometry: Vector3[],
        properties: ValueMap,
        featureId: string | number | undefined
    ): void;

    /**
     * Process a sequence of line features.
     *
     * Each line is represented as an Array of local webMercator coordinates (coordinates relative
     * to tile's north-east corner).
     *
     * @param layerName - The name of the enclosing layer.
     * @param tileExtents -The tile size (north to south, east to west) in webMercator.
     * @param geometry - The list of line geometries.
     * @param properties - The geometry properties.
     * @param featureId - The feature identifier.
     */
    processLineFeature(
        layerName: string,
        tileExtents: number,
        geometry: ILineGeometry[],
        properties: ValueMap,
        featureId: string | number | undefined
    ): void;

    /**
     * Process a sequence of polygon features.
     *
     * Each polygon is represented as an Array of contour representing exterior and interior rings
     * in local webMercator coordinates  (coordinates relative to tile's north-east corner).
     *
     * @param layerName - The name of the enclosing layer.
     * @param tileExtents - The tile size (north to south, east to west) in webMercator.
     * @param geometry - The list of polygons in local webMercator coordinates.
     * @param properties - The geometry properties.
     * @param featureId - The feature identifier.
     */
    processPolygonFeature(
        layerName: string,
        tileExtents: number,
        geometry: IPolygonGeometry[],
        properties: ValueMap,
        featureId: string | number | undefined
    ): void;
}
