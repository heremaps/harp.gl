/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { Vector3 } from "three";

/**
+ *  An interface to represent inner and outer rings of a [[IPolygonGeometry]].
+ */
export interface IRing {
    /**
     * The [[GeoCoordinates]] of this [[IRing]].
     */
    readonly positions: Vector3[];

    /**
     * Boolean array representing if the edges of this [[IRing]] should be considered as potential
     * outlines.
     */
    readonly outlines?: boolean[];
}

/**
 * An interface to represent polygon geometries.
 */
export interface IPolygonGeometry {
    /**
     * The rings of this polygon.
     */
    readonly rings: IRing[];
}

/**
 * An interface to represent line geometries.
 */
export interface ILineGeometry {
    /**
     * The positions of this [[IlineGeometry]] projected in world space.
     */
    readonly positions: Vector3[];
}

/**
 * The [[IGeometryProcessor]] is used to process geometry features encoded in OMV tiles.
 *
 * [[OmvDecoder]] will pass to the processing methods of the concrete implementations
 * of this interface, sequences of geometries projected in the world space of the OMV
 * [[TilingScheme]] that is always defined to be an instance of [[webMercatorTilingScheme]].
 * If desired, the world positions can be converted to [[GeoCoordinates]] using the
 * [[Projection.unprojectPoint]], for example:
 *
 * ```typescript:
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
 * The methods of concrete implementations of [[IGeometryProcessor]]
 * are called to process point, linestring and polygon geometries,
 * see [[OmvDecoder]].
 */
export interface IGeometryProcessor {
    /**
     * Process a sequence of point features.
     *
     * The points are represented as GeoCoordinates.
     *
     * @param layerName The name of the enclosing layer.
     * @param geometry The positions of the point features in the projected world coordinates.
     * @param env The enviroment containing the properties of the geometry.
     * @param storageLevel The storage level of the data.
     */
    processPointFeature(
        layerName: string,
        geometry: Vector3[],
        env: MapEnv,
        storageLevel: number
    ): void;

    /**
     * Process a sequence of line features.
     *
     * Each line is represented as an Array of GeoCoordinates.
     *
     * @param layerName The name of the enclosing layer.
     * @param geometry The list of line geometries.
     * @param env The enviroment containing the properties of the geometry.
     * @param storageLevel The storage level of the data.
     */
    processLineFeature(
        layerName: string,
        geometry: ILineGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void;

    /**
     * Process a squence of polygon features.
     *
     * Each polygon is represented as an Array of countour representing
     * exterior and interior rings.
     *
     * @param layerName The name of the enclosing layer.
     * @param geometry The list of polygons.
     * @param env The enviroment containing the properties of the geometry.
     * @param storageLevel The storage level of the data.
     */
    processPolygonFeature(
        layerName: string,
        geometry: IPolygonGeometry[],
        env: MapEnv,
        storageLevel: number
    ): void;
}
