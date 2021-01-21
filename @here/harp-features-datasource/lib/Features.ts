/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    FeatureGeometry,
    LineString,
    MultiLineString,
    MultiPoint,
    MultiPolygon,
    Point,
    Polygon
} from "@here/harp-datasource-protocol";
import * as THREE from "three";

/**
 * Base class to create features.
 */
export abstract class MapViewFeature {
    /**
     * The type of the feature. The extended class should initialize this value. It defaults to
     * "Point" in order to avoid allowing `null` or `undefined`.
     */
    type: FeatureGeometry["type"] = "Point";

    /**
     * A string identifying this feature.
     */
    uuid: string = THREE.MathUtils.generateUUID();

    /**
     * Builds a new `MapViewFeature`.
     *
     * @param coordinates - The GeoJson geometry.
     * @param style - The style to render the geometry.
     */
    constructor(public coordinates: FeatureGeometry["coordinates"], public properties?: {}) {}
}

export class MapViewLineFeature extends MapViewFeature {
    /** @override */
    type: LineString["type"] = "LineString";
    constructor(public coordinates: LineString["coordinates"], public properties?: {}) {
        super(coordinates, properties);
    }
}

export class MapViewMultiLineFeature extends MapViewFeature {
    /** @override */
    type: MultiLineString["type"] = "MultiLineString";
    constructor(public coordinates: MultiLineString["coordinates"], public properties?: {}) {
        super(coordinates, properties);
    }
}

export class MapViewPolygonFeature extends MapViewFeature {
    /** @override */
    type: Polygon["type"] = "Polygon";
    constructor(public coordinates: Polygon["coordinates"], public properties?: {}) {
        super(coordinates, properties);
    }
}

export class MapViewMultiPolygonFeature extends MapViewFeature {
    /** @override */
    type: MultiPolygon["type"] = "MultiPolygon";
    constructor(public coordinates: MultiPolygon["coordinates"], public properties?: {}) {
        super(coordinates, properties);
    }
}

export class MapViewPointFeature extends MapViewFeature {
    /** @override */
    type: Point["type"] = "Point";
    constructor(public coordinates: Point["coordinates"], public properties?: {}) {
        super(coordinates, properties);
    }
}

export class MapViewMultiPointFeature extends MapViewFeature {
    /** @override */
    type: MultiPoint["type"] = "MultiPoint";
    constructor(public coordinates: MultiPoint["coordinates"], public properties?: {}) {
        super(coordinates, properties);
    }
}
