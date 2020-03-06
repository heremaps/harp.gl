/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinatesLike, isGeoCoordinatesLike } from "./GeoCoordinatesLike";
import { GeoPointLike, isGeoPointLike } from "./GeoPointLike";
import { isLatLngLike, LatLngLike } from "./LatLngLike";

import * as THREE from "three";

/**
 * Represents an object in different geo coordinate formats
 */
export type GeoCoordLike = GeoPointLike | GeoCoordinatesLike | LatLngLike;

/**
 * `GeoCoordinates` is used to represent geo positions.
 */
export class GeoCoordinates implements GeoCoordinatesLike {
    /**
     * Returns a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude Latitude in degrees.
     * @param longitude Longitude in degrees.
     * @param altitude Altitude in meters.
     */
    static fromDegrees(latitude: number, longitude: number, altitude?: number): GeoCoordinates {
        return new GeoCoordinates(latitude, longitude, altitude);
    }

    /**
     * Returns a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude Latitude in radians.
     * @param longitude Longitude in radians.
     * @param altitude Altitude in meters.
     */
    static fromRadians(latitude: number, longitude: number, altitude?: number): GeoCoordinates {
        return new GeoCoordinates(
            THREE.MathUtils.radToDeg(latitude),
            THREE.MathUtils.radToDeg(longitude),
            altitude
        );
    }

    /**
     * Creates a [[GeoCoordinates]] from a [[LatLngLike]] literal.
     * ```typescript
     * const center = { lat: 53.3, lng: 13.4 };
     * mapView.geoCenter = GeoCoordinates.fromLatLng(center);
     * ```
     * @param latLng A [[LatLngLike]] object literal.
     */
    static fromLatLng(latLng: LatLngLike) {
        return new GeoCoordinates(latLng.lat, latLng.lng);
    }

    /**
     * Creates a [[GeoCoordinates]] from a [[GeoPointLike]] tuple.
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
     * @param geoPoint An [[Array]] of at least two elements following the order
     * longitude, latitude, altitude.
     */
    static fromGeoPoint(geoPoint: GeoPointLike): GeoCoordinates {
        return new GeoCoordinates(geoPoint[1], geoPoint[0], geoPoint[2]);
    }

    /**
     * Creates a [[GeoCoordinates]] from different types of geo coordinate objects.
     *
     * Example:
     * ```typescript
     * const fromGeoPointLike = GeoCoordinates.fromObject([longitude, latitude]);
     * const fromGeoCoordinateLike = GeoCoordinates.fromObject({ longitude, latitude });
     * const fromGeoCoordinate = GeoCoordinates.fromObject(new GeoCoordinates(latitude, longitude));
     * const fromLatLngLike = GeoCoordinates.fromObject({ lat: latitude , lng: longitude });
     * ```
     *
     * @param geoPoint Either [[GeoPointLike]], [[GeoCoordinatesLike]]
     * or [[LatLngLike]] object literal.
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
     * Creates a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude Latitude in degrees.
     * @param longitude Longitude in degrees.
     * @param altitude Altitude in meters.
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

        if (latitude > 90) {
            let wrapped = (latitude + 90) % 360;
            if (wrapped >= 180) {
                longitude += 180;
                wrapped = 360 - wrapped;
            }

            latitude = wrapped - 90;
        }

        if (latitude < -90) {
            let wrapped = (latitude - 90) % 360;
            if (wrapped <= -180) {
                longitude += 180;
                wrapped = -360 - wrapped;
            }

            latitude = wrapped + 90;
        }

        if (longitude < -180 || longitude > 180) {
            const sign = Math.sign(longitude);
            longitude = (((longitude % 360) + 180 * sign) % 360) - 180 * sign;
        }

        if (latitude === this.latitude && longitude === this.longitude) {
            return this;
        }

        return new GeoCoordinates(latitude, longitude, this.altitude);
    }

    /**
     * Returns `true` if this `GeoCoordinates` is equal to the other.
     *
     * @param other GeoCoordinatesLike to compare to.
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
     * @param other GeoCoordinatesLike to copy all values from.
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
     * Returns this [[GeoCoordinates]] as [[LatLngLike]] literal.
     */
    toLatLng(): LatLngLike {
        return { lat: this.latitude, lng: this.longitude };
    }

    /**
     * Converts this [[GeoCoordinates]] to a [[GeoPointLike]].
     */
    toGeoPoint(): GeoPointLike {
        return this.altitude !== undefined
            ? [this.longitude, this.latitude, this.altitude]
            : [this.longitude, this.latitude];
    }
}
