/*
 * Copyright (C) 2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents an object that carry {@link GeoBox} extents like interface.
 */
export interface GeoBoxExtentLike {
    /**
     * Latitude span in degrees.
     */
    readonly latitudeSpan: number;

    /**
     * Longitude span in degrees
     */
    readonly longitudeSpan: number;
}

/**
 * Type guard to assert that `object` conforms to {@link GeoBoxExtentLike} interface.
 */
export function isGeoBoxExtentLike(obj: any): obj is GeoBoxExtentLike {
    return (
        obj &&
        typeof obj === "object" &&
        typeof obj.latitudeSpan === "number" &&
        typeof obj.longitudeSpan === "number"
    );
}
