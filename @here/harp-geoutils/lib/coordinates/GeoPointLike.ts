/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * An [[Array]] following the order longitude, latitude, altitude.
 */
export type GeoPointLike = [number, number, number?];

/**
 * Type guard to assert that `object` conforms to [[GeoPointLike]] interface.
 */
export function isGeoPointLike(geoPoint: any): geoPoint is GeoPointLike {
    if (Array.isArray(geoPoint)) {
        const [longitude, latitude, altitude] = geoPoint;
        return (
            typeof longitude === "number" &&
            typeof latitude === "number" &&
            (altitude === undefined || typeof altitude === "number")
        );
    }
    return false;
}
