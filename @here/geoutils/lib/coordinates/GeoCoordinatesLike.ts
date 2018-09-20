/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
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
 * Type guard to assert that `object` conforms to [[GeoCoordinatesLike]] data interface.
 */
export function isGeoCoordinatesLike(object: any): object is GeoCoordinatesLike {
    return (
        object &&
        typeof object.latitude === "number" &&
        typeof object.longitude === "number" &&
        (typeof object.altitude === "number" || typeof object.altitude === "undefined")
    );
}
