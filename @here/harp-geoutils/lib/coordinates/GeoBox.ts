/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import * as THREE from "three";

import { GeoBoxExtentLike } from "./GeoBoxExtentLike";
import { GeoCoordinates, MAX_LONGITUDE } from "./GeoCoordinates";
import { GeoCoordinatesLike } from "./GeoCoordinatesLike";

/**
 * `GeoBox` is used to represent a bounding box in geo coordinates.
 */
export class GeoBox implements GeoBoxExtentLike {
    /**
     * Returns a `GeoBox` with the given geo coordinates.
     *
     * @param southWest - The south west position in geo coordinates.
     * @param northEast - The north east position in geo coordinates.
     */
    static fromCoordinates(southWest: GeoCoordinates, northEast: GeoCoordinates): GeoBox {
        return new GeoBox(southWest, northEast);
    }

    /**
     * Returns a `GeoBox` with the given center and dimensions.
     *
     * @param center - The center position of geo box.
     * @param extent - Box latitude and logitude span
     */
    static fromCenterAndExtents(center: GeoCoordinates, extent: GeoBoxExtentLike): GeoBox {
        return new GeoBox(
            new GeoCoordinates(
                center.latitude - extent.latitudeSpan / 2,
                center.longitude - extent.longitudeSpan / 2
            ),
            new GeoCoordinates(
                center.latitude + extent.latitudeSpan / 2,
                center.longitude + extent.longitudeSpan / 2
            )
        );
    }

    /**
     * Constructs a new `GeoBox` with the given geo coordinates.
     *
     * @param southWest - The south west position in geo coordinates.
     * @param northEast - The north east position in geo coordinates.
     */
    constructor(readonly southWest: GeoCoordinates, readonly northEast: GeoCoordinates) {
        if (this.west > this.east) {
            this.northEast.longitude += 360;
        }
    }

    /**
     * Returns the minimum altitude or `undefined`.
     */
    get minAltitude(): number | undefined {
        if (this.southWest.altitude === undefined || this.northEast.altitude === undefined) {
            return undefined;
        }
        return Math.min(this.southWest.altitude, this.northEast.altitude);
    }

    /**
     * Returns the maximum altitude or `undefined`.
     */
    get maxAltitude(): number | undefined {
        if (this.southWest.altitude === undefined || this.northEast.altitude === undefined) {
            return undefined;
        }
        return Math.max(this.southWest.altitude, this.northEast.altitude);
    }

    /**
     * Returns the south latitude in degrees of this `GeoBox`.
     */
    get south(): number {
        return this.southWest.latitude;
    }

    /**
     * Returns the north altitude in degrees of this `GeoBox`.
     */
    get north(): number {
        return this.northEast.latitude;
    }

    /**
     * Returns the west longitude in degrees of this `GeoBox`.
     */
    get west(): number {
        return this.southWest.longitude;
    }

    /**
     * Returns the east longitude in degrees of this `GeoBox`.
     */
    get east(): number {
        return this.northEast.longitude;
    }

    /**
     * Returns the center of this `GeoBox`.
     */
    get center(): GeoCoordinates {
        const latitude = (this.south + this.north) * 0.5;
        const { west, east } = this;
        const { minAltitude, altitudeSpan } = this;

        let altitude: number | undefined;

        if (minAltitude !== undefined && altitudeSpan !== undefined) {
            altitude = minAltitude + altitudeSpan * 0.5;
        }

        if (west <= east) {
            return new GeoCoordinates(latitude, (west + east) * 0.5, altitude);
        }

        let longitude = (360 + east + west) * 0.5;

        if (longitude > 360) {
            longitude -= 360;
        }

        return new GeoCoordinates(latitude, longitude, altitude);
    }

    /**
     * Returns the latitude span in radians.
     */
    get latitudeSpanInRadians(): number {
        return THREE.MathUtils.degToRad(this.latitudeSpan);
    }

    /**
     * Returns the longitude span in radians.
     */
    get longitudeSpanInRadians(): number {
        return THREE.MathUtils.degToRad(this.longitudeSpan);
    }

    /**
     * Returns the latitude span in degrees.
     */
    get latitudeSpan(): number {
        return this.north - this.south;
    }

    get altitudeSpan(): number | undefined {
        if (this.maxAltitude === undefined || this.minAltitude === undefined) {
            return undefined;
        }
        return this.maxAltitude - this.minAltitude;
    }

    /**
     * Returns the longitude span in degrees.
     */
    get longitudeSpan(): number {
        let width = this.northEast.longitude - this.southWest.longitude;

        if (width < 0) {
            width += 360;
        }

        return width;
    }

    /**
     * Returns the latitude span in degrees.
     * @deprecated Use [[latitudeSpan]] instead.
     */
    get latitudeSpanInDegrees(): number {
        return this.latitudeSpan;
    }

    /**
     * Returns the longitude span in degrees.
     * @deprecated Use [[longitudeSpan]] instead.
     */
    get longitudeSpanInDegrees(): number {
        return this.longitudeSpan;
    }

    /**
     * Returns `true` if the given geo coordinates are contained in this `GeoBox`.
     *
     * @param point - The geo coordinates.
     */
    contains(point: GeoCoordinates): boolean {
        if (
            point.altitude === undefined ||
            this.minAltitude === undefined ||
            this.maxAltitude === undefined
        ) {
            return this.containsHelper(point);
        }

        const isFlat = this.minAltitude === this.maxAltitude;
        const isSameAltitude = this.minAltitude === point.altitude;
        const isWithinAltitudeRange =
            this.minAltitude <= point.altitude && this.maxAltitude > point.altitude;

        // If box is flat, we should check the altitude and containment,
        // otherwise we should check also altitude difference where we consider
        // point to be inside if alt is from [m_minAltitude, m_maxAltitude) range!
        if (isFlat ? isSameAltitude : isWithinAltitudeRange) {
            return this.containsHelper(point);
        }

        return false;
    }

    /**
     * Clones this `GeoBox` instance.
     */
    clone(): GeoBox {
        return new GeoBox(this.southWest.clone(), this.northEast.clone());
    }

    /**
     * Update the bounding box by considering a given point.
     *
     * @param point - The point that may expand the bounding box.
     */
    growToContain(point: GeoCoordinatesLike) {
        this.southWest.latitude = Math.min(this.southWest.latitude, point.latitude);
        this.southWest.longitude = Math.min(this.southWest.longitude, point.longitude);
        this.southWest.altitude =
            this.southWest.altitude !== undefined && point.altitude !== undefined
                ? Math.min(this.southWest.altitude, point.altitude)
                : this.southWest.altitude !== undefined
                ? this.southWest.altitude
                : point.altitude !== undefined
                ? point.altitude
                : undefined;

        this.northEast.latitude = Math.max(this.northEast.latitude, point.latitude);
        this.northEast.longitude = Math.max(this.northEast.longitude, point.longitude);
        this.northEast.altitude =
            this.northEast.altitude !== undefined && point.altitude !== undefined
                ? Math.max(this.northEast.altitude, point.altitude)
                : this.northEast.altitude !== undefined
                ? this.northEast.altitude
                : point.altitude !== undefined
                ? point.altitude
                : undefined;
    }

    private containsHelper(point: GeoCoordinates): boolean {
        if (point.latitude < this.southWest.latitude || point.latitude >= this.northEast.latitude) {
            return false;
        }

        const { west, east } = this;

        let longitude = point.longitude;
        if (east > MAX_LONGITUDE) {
            while (longitude < west) {
                longitude = longitude + 360;
            }
        }

        if (longitude > east) {
            while (longitude > west + 360) {
                longitude = longitude - 360;
            }
        }

        return longitude >= west && longitude < east;
    }
}
