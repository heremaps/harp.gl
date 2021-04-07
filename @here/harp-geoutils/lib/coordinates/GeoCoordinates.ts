/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

import { GeoCoordinatesLike, isGeoCoordinatesLike } from "./GeoCoordinatesLike";
import { GeoCoordLike } from "./GeoCoordLike";
import { GeoPointLike, isGeoPointLike } from "./GeoPointLike";
import { isLatLngLike, LatLngLike } from "./LatLngLike";

export const MAX_LATITUDE = 90;
export const MIN_LATITUDE = -90;
export const MAX_LONGITUDE = 180;
export const MIN_LONGITUDE = -180;

const tmpV0 = new THREE.Vector3();
const tmpV1 = new THREE.Vector3();

/**
 * Compute the modulo.
 *
 * @internal
 */
function mod(dividend: number, divisor: number): number {
    const modulo = dividend % divisor;
    const modulo_sign = modulo < 0;
    const divisor_sign = divisor < 0;
    return modulo_sign === divisor_sign ? modulo : modulo + divisor;
}

/**
 * `GeoCoordinates` is used to represent geo positions.
 */
export class GeoCoordinates implements GeoCoordinatesLike {
    /**
     * Returns a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude - Latitude in degrees.
     * @param longitude - Longitude in degrees.
     * @param altitude - Altitude in meters.
     */
    static fromDegrees(latitude: number, longitude: number, altitude?: number): GeoCoordinates {
        return new GeoCoordinates(latitude, longitude, altitude);
    }

    /**
     * Returns a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude - Latitude in radians.
     * @param longitude - Longitude in radians.
     * @param altitude - Altitude in meters.
     */
    static fromRadians(latitude: number, longitude: number, altitude?: number): GeoCoordinates {
        return new GeoCoordinates(
            THREE.MathUtils.radToDeg(latitude),
            THREE.MathUtils.radToDeg(longitude),
            altitude
        );
    }

    /**
     * Creates a {@link GeoCoordinates} from a {@link LatLngLike} literal.
     * ```typescript
     * const center = { lat: 53.3, lng: 13.4 };
     * mapView.geoCenter = GeoCoordinates.fromLatLng(center);
     * ```
     * @param latLng - A {@link LatLngLike} object literal.
     */
    static fromLatLng(latLng: LatLngLike) {
        return new GeoCoordinates(latLng.lat, latLng.lng);
    }

    /**
     * Creates a {@link GeoCoordinates} from a [[GeoPointLike]] tuple.
     *
     * Example:
     * ```typescript
     * mapView.geoCenter = GeoCoordinates.fromGeoPoint([longitude, latitude]);
     *
     * let geoCoords: number[] = ...;
     *
     * if (isGeoPointLike(geoCoords)) {
     *     const p = GeoCoordinates.fromGeoPoint(geoCoords);
     * }
     * ```
     * @param geoPoint - An [[Array]] of at least two elements following the order
     * longitude, latitude, altitude.
     */
    static fromGeoPoint(geoPoint: GeoPointLike): GeoCoordinates {
        return new GeoCoordinates(geoPoint[1], geoPoint[0], geoPoint[2]);
    }

    /**
     * Creates a {@link GeoCoordinates} from different types of geo coordinate objects.
     *
     * Example:
     * ```typescript
     * const fromGeoPointLike = GeoCoordinates.fromObject([longitude, latitude]);
     * const fromGeoCoordinateLike = GeoCoordinates.fromObject({ longitude, latitude });
     * const fromGeoCoordinate = GeoCoordinates.fromObject(new GeoCoordinates(latitude, longitude));
     * const fromLatLngLike = GeoCoordinates.fromObject({ lat: latitude , lng: longitude });
     * ```
     *
     * @param geoPoint - Either [[GeoPointLike]], {@link GeoCoordinatesLike}
     * or {@link LatLngLike} object literal.
     */
    static fromObject(geoPoint: GeoCoordLike): GeoCoordinates {
        if (isGeoPointLike(geoPoint)) {
            return GeoCoordinates.fromGeoPoint(geoPoint);
        } else if (isGeoCoordinatesLike(geoPoint)) {
            return GeoCoordinates.fromDegrees(
                geoPoint.latitude,
                geoPoint.longitude,
                geoPoint.altitude
            );
        } else if (isLatLngLike(geoPoint)) {
            return GeoCoordinates.fromDegrees(geoPoint.lat, geoPoint.lng);
        }

        throw new Error("Invalid input coordinate format.");
    }

    /**
     * Returns a `GeoCoordinates` resulting from the linear interpolation of other two.
     * @param geoCoords0 - One of the `GeoCoordinates` used for interpolation.
     * @param geoCoords1 - The other `GeoCoordinates` used for interpolation.
     * @param factor - Interpolation factor. If `0` result will be equal to `geoCoords0`, if `1`
     * it'll be equal to `geoCoords1`.
     * @param wrap - If `true`, interpolation will be done across the antimeridian, otherwise it's
     * done across the Greenwich meridian. Supported only if longitude span is less than 360 deg.
     * @default false
     * @param normalize - If `true`, interpolation result will be normalized. @default false
     */
    static lerp(
        geoCoords0: GeoCoordinates,
        geoCoords1: GeoCoordinates,
        factor: number,
        wrap: boolean = false,
        normalize: boolean = false
    ): GeoCoordinates {
        if (wrap) {
            if (geoCoords0.lng < geoCoords1.lng) {
                const geoCoordsEnd = geoCoords0.clone();
                geoCoordsEnd.longitude += 360;
                return this.lerp(geoCoords1, geoCoordsEnd, 1 - factor);
            } else {
                const geoCoordsEnd = geoCoords1.clone();
                geoCoordsEnd.longitude += 360;
                return this.lerp(geoCoords0, geoCoordsEnd, factor);
            }
        }

        const v0 = tmpV0.set(geoCoords0.lat, geoCoords0.lng, geoCoords0.altitude ?? 0);
        const v1 = tmpV1.set(geoCoords1.lat, geoCoords1.lng, geoCoords1.altitude ?? 0);
        v0.lerp(v1, factor);
        const result = new GeoCoordinates(v0.x, v0.y, v0.z);

        return normalize ? result.normalized() : result;
    }

    /**
     * Creates a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude - Latitude in degrees.
     * @param longitude - Longitude in degrees.
     * @param altitude - Altitude in meters.
     */
    constructor(public latitude: number, public longitude: number, public altitude?: number) {}

    /**
     * Returns the latitude in radians.
     */
    get latitudeInRadians(): number {
        return THREE.MathUtils.degToRad(this.latitude);
    }

    /**
     * Returns the longitude in radians.
     */
    get longitudeInRadians(): number {
        return THREE.MathUtils.degToRad(this.longitude);
    }

    /**
     * Returns the latitude in degrees.
     * @deprecated Use the [[latitude]] property instead.
     */
    get latitudeInDegrees(): number {
        return this.latitude;
    } // compat api

    /**
     * Returns the longitude in degrees.
     * @deprecated Use the [[longitude]] property instead.
     */
    get longitudeInDegrees(): number {
        return this.longitude;
    } // compat api

    /**
     * The latitude in the degrees.
     */
    get lat() {
        return this.latitude;
    }

    /**
     * The longitude in the degrees.
     */
    get lng() {
        return this.longitude;
    }

    /**
     * Returns `true` if this `GeoCoordinates` is valid; returns `false` otherwise.
     */
    isValid(): boolean {
        return !isNaN(this.latitude) && !isNaN(this.longitude);
    }

    /**
     * Returns the normalized `GeoCoordinates`.
     */
    normalized(): GeoCoordinates {
        let { latitude, longitude } = this;
        if (isNaN(latitude) || isNaN(longitude)) {
            return this;
        }
        if (longitude < -180 || longitude > 180) {
            longitude = mod(longitude + 180, 360) - 180;
        }
        latitude = THREE.MathUtils.clamp(latitude, -90, 90);
        return new GeoCoordinates(latitude, longitude, this.altitude);
    }

    /**
     * Returns `true` if this `GeoCoordinates` is equal to the other.
     *
     * @param other - GeoCoordinatesLike to compare to.
     */
    equals(other: GeoCoordinatesLike): boolean {
        return (
            this.latitude === other.latitude &&
            this.longitude === other.longitude &&
            this.altitude === other.altitude
        );
    }

    /**
     * Copy values from the other.
     *
     * @param other - GeoCoordinatesLike to copy all values from.
     */
    copy(other: GeoCoordinatesLike): GeoCoordinates {
        this.latitude = other.latitude;
        this.longitude = other.longitude;
        this.altitude = other.altitude;
        return this;
    }

    /**
     * Clones this `GeoCoordinates`.
     */
    clone(): GeoCoordinates {
        return new GeoCoordinates(this.latitude, this.longitude, this.altitude);
    }

    /**
     * Returns this {@link GeoCoordinates} as {@link LatLngLike} literal.
     */
    toLatLng(): LatLngLike {
        return { lat: this.latitude, lng: this.longitude };
    }

    /**
     * Converts this {@link GeoCoordinates} to a [[GeoPointLike]].
     */
    toGeoPoint(): GeoPointLike {
        return this.altitude !== undefined
            ? [this.longitude, this.latitude, this.altitude]
            : [this.longitude, this.latitude];
    }

    /**
     * Returns the minimum longitude span from this `GeoCoordinates` to another.
     *
     * @param other - The other GeoCoordinatesLike defining the longitude span.
     */
    minLongitudeSpanTo(other: GeoCoordinatesLike): number {
        const minLongitude = Math.min(this.longitude, other.longitude);
        const maxLongitude = Math.max(this.longitude, other.longitude);

        return Math.min(maxLongitude - minLongitude, 360 + minLongitude - maxLongitude);
    }
}
