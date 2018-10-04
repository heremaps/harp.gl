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

import { GeoCoordinatesLike } from "./GeoCoordinatesLike";

const RAD2DEG = 180.0 / Math.PI;
const DEG2RAD = Math.PI / 180.0;

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
        return new GeoCoordinates(latitude * RAD2DEG, longitude * RAD2DEG, altitude);
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
        return this.latitude * DEG2RAD;
    }

    /**
     * Returns the longitude in radians.
     */
    get longitudeInRadians(): number {
        return this.longitude * DEG2RAD;
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
            longitude = ((longitude + 180) % 360) - 180;
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
     * @deprecated
     */
    clone(): GeoCoordinates {
        return new GeoCoordinates(this.latitude, this.longitude, this.altitude);
    }
}
