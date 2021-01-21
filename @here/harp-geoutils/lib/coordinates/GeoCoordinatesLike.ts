/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents an object with `GeoCoordinates` like interface.
 */
export interface GeoCoordinatesLike {
    /** The latitude in degrees. */
    latitude: number;

    /** The longitude in degrees. */
    longitude: number;

    /** The optional altitude in meters. */
    altitude?: number;
}

/**
 * Type guard to assert that `object` conforms to {@link GeoCoordinatesLike} data interface.
 */
export function isGeoCoordinatesLike(object: any): object is GeoCoordinatesLike {
    return (
        object &&
        typeof object.latitude === "number" &&
        typeof object.longitude === "number" &&
        (typeof object.altitude === "number" || typeof object.altitude === "undefined")
    );
}
