/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/index-decoder";
import { GeoCoordinates } from "@here/harp-geoutils";

/**
+ *  An interface to represent inner and outer rings of a [[IPolygonGeometry]].
+ */
export interface IRing {
    /**
     * The [[GeoCoordinates]] of this [[IRing]].
     */
    coordinates: GeoCoordinates[];

    /**
     * Boolean array representing if the edges of this [[IRing]] should be considered as potential
     * outlines.
     */
    outlines?: boolean[];
}

/**
 * An interface to represent polygon geometries.
 */
export interface IPolygonGeometry {
    /**
     * The rings of this polygon.
     */
    rings: IRing[];
}

/**
 * An interface to represent line geometries.
 */
export interface ILineGeometry {
    /**
     * The [[GeoCoordinates]] of the line.
     */
    coordinates: GeoCoordinates[];
}

/**
 * The IGeometryProcessor is used to process geo data.
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
     * @param geometry The list of geo points.
     * @param env The enviroment containing the properties of the geometry.
     * @param storageLevel The storage level of the data.
     */
    processPointFeature(
        layerName: string,
        geometry: GeoCoordinates[],
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
