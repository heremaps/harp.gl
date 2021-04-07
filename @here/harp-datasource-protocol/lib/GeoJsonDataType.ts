/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Feature details contains `feature.id`, `feature.properties.featureClass` which provides
 * possibility to define style in theme for particular feature.
 */
export interface FeatureDetails {
    featureId?: string;
    featureClass?: string;
}

/**
 * Represents "Point" GeoJSON geometry object.
 */
export interface Point {
    type: "Point";
    coordinates: number[];
}

/**
 * Represents "MultiPoint" GeoJSON geometry object.
 */
export interface MultiPoint {
    type: "MultiPoint";
    coordinates: number[][];
}

/**
 * Represents "LineString" GeoJSON geometry object.
 */
export interface LineString {
    type: "LineString";
    coordinates: number[][];
}

/**
 * Represents "MultiLineString" GeoJSON geometry object.
 */
export interface MultiLineString {
    type: "MultiLineString";
    coordinates: number[][][];
}

/**
 * Represents "Polygon" GeoJSON geometry object.
 */
export interface Polygon {
    type: "Polygon";
    coordinates: number[][][];
}

/**
 * Represents "MultiPolygon" GeoJSON geometry object.
 */
export interface MultiPolygon {
    type: "MultiPolygon";
    coordinates: number[][][][];
}

/**
 * Represents "geometry" property of "Feature" GeoJSON object.
 */
export type FeatureGeometry =
    | Point
    | MultiPoint
    | LineString
    | MultiLineString
    | Polygon
    | MultiPolygon;

export function isFeatureGeometry(object: any): object is FeatureGeometry {
    const t = object.type;
    return (
        t === "Point" ||
        t === "MultiPoint" ||
        t === "LineString" ||
        t === "MultiLineString" ||
        t === "Polygon" ||
        t === "MultiPolygon"
    );
}

/**
 * Represents "GeometryCollection" GeoJSON geometry object.
 */
export interface GeometryCollection {
    type: "GeometryCollection";
    geometries: FeatureGeometry[];
}

/**
 * Represents "Feature" GeoJSON object.
 */
export interface Feature {
    type: "Feature";
    bbox?: number[];
    id?: string;
    geometry: FeatureGeometry | GeometryCollection;
    properties?: any;
    title?: string;
}

/**
 * Represents "FeatureCollection" GeoJSON object.
 */
export interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
}

/**
 * Represents a GeoJSON object.
 */
export type GeoJson = FeatureGeometry | GeometryCollection | Feature | FeatureCollection;
