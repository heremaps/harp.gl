/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv } from "@here/harp-datasource-protocol/lib/Theme";
import { GeoCoordinates } from "@here/harp-geoutils";

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
     * @param displayZoomLevel The desired display zoom level.
     */
    processPointFeature(
        layerName: string,
        geometry: GeoCoordinates[],
        env: MapEnv,
        storageLevel: number,
        displayZoomLevel: number
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
     * @param displayZoomLevel The desired display zoom level.
     */
    processLineFeature(
        layerName: string,
        geometry: GeoCoordinates[][],
        env: MapEnv,
        storageLevel: number,
        displayZoomLevel: number
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
     * @param displayZoomLevel The desired display zoom level.
     */
    processPolygonFeature(
        layerName: string,
        geometry: GeoCoordinates[][][],
        env: MapEnv,
        storageLevel: number,
        displayZoomLevel: number
    ): void;
}
