/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordLike, isGeoCoordLike } from "./GeoCoordLike";

/**
 * Represents an object with `GeoPolygon` like interface.
 *
 * This is defined as an Array of GeoCoordinates sorted in ccw order.
 *
 * @beta, @internal
 */
export interface GeoPolygonLike {
    /**
     * Array of ccw sorted GeoCoordLike
     */
    coordinates: GeoCoordLike[];
}

/**
 * Type guard to assert that `object` conforms to {@link GeoPolygonLike} data interface.
 *
 * @beta, @internal
 */
export function isGeoPolygonLike(object: any): object is GeoPolygonLike {
    if (!object || (!Array.isArray(object.coordinates) && object.coordinates.length > 2)) {
        return false;
    }
    let isValid: boolean = true;
    //TODO: this might take a while, not sure this should be that extensive
    object.coordinates.forEach((coord: any) => {
        if (!isGeoCoordLike(object)) {
            isValid = false;
        }
    });
    return isValid;
}
