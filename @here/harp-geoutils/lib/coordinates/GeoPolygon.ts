/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Vector2 } from "three";

import { GeoBox } from "./GeoBox";
import { GeoCoordinates, MAX_LATITUDE, MIN_LATITUDE } from "./GeoCoordinates";
import { GeoCoordinatesLike } from "./GeoCoordinatesLike";
import { GeoCoordLike, geoCoordLikeToGeoCoordinatesLike } from "./GeoCoordLike";
import { GeoPolygonLike } from "./GeoPolygonLike";

type MinThreeItemsArray<T> = [T, T, T, ...T[]];

export type GeoPolygonCoordinates = MinThreeItemsArray<
    GeoCoordinatesLike | GeoCoordinates | GeoCoordLike
>;

/**
 * A GeoPolygon in 2D Space (altitudes will be ignored).
 * Coordinates are expected in counter-clockwise order, for convex polygons a sorting is
 * available.
 * Clockwise ordered or selfintersecting Polygons might lead to no or unexpected results.
 *
 * @beta @internal
 */
export class GeoPolygon implements GeoPolygonLike {
    private readonly m_coordinates: MinThreeItemsArray<GeoCoordinatesLike>;

    /**
     * Creates a GeoPolygon instance
     *
     * @param coordinates An array of GeoCoordinates acting as the Vertices of the Polygon.
     * @param needsSort  If `true` it will sort the coordinates in ccw order, this will only
     *  result correctly for convex polygons @default false
     * @param needsWrapping  If `true` it will wrap around coordinates crossing the antemeridian.
     */
    constructor(
        coordinates: GeoPolygonCoordinates,
        needsSort: boolean = false,
        needsWrapping: boolean = false
    ) {
        this.m_coordinates = coordinates.map(coord => {
            return geoCoordLikeToGeoCoordinatesLike(coord);
        }) as MinThreeItemsArray<GeoCoordinatesLike>;
        if (needsSort) {
            this.sortCCW();
        }
        if (needsWrapping) {
            this.wrapCoordinatesAround();
        }
    }

    get coordinates(): MinThreeItemsArray<GeoCoordinatesLike> {
        return this.m_coordinates;
    }

    /**
     * Gets a BoundingBox for the Polygon
     *
     * Might have unexpected results for twisted or concave Polygons
     */
    getGeoBoundingBox(): GeoBox {
        const centroid = this.getCentroid();
        if (centroid === undefined) {
            //return a BBox without extend if the centroid could not be generated
            return GeoBox.fromCoordinates(
                this.coordinates[0] as GeoCoordinates,
                this.coordinates[0] as GeoCoordinates
            );
        }
        const { east, west } = this.getEastAndWest(centroid);
        const { north, south } = this.getNorthAndSouth();
        return GeoBox.fromCoordinates(
            new GeoCoordinates(south, west),
            new GeoCoordinates(north, east)
        );
    }

    /**
     * Gets the Centroid for the Polygon
     *
     * Might be undefined or with unexpected results for twisted or concave Polygons.
     */
    getCentroid(): GeoCoordinates | undefined {
        const area = this.getArea();
        if (area === 0) {
            return undefined;
        }
        let latitude = 0;
        let longitude = 0;
        let f;

        let previousIndex = this.m_coordinates.length - 1;

        this.m_coordinates.forEach((coordinate, index) => {
            const previousCoordinate = this.m_coordinates[previousIndex];
            f =
                coordinate.latitude * previousCoordinate.longitude -
                previousCoordinate.latitude * coordinate.longitude;
            latitude += (coordinate.latitude + previousCoordinate.latitude) * f;
            longitude += (coordinate.longitude + previousCoordinate.longitude) * f;
            previousIndex = index;
        });

        f = area * 6;

        return new GeoCoordinates(
            latitude / f,
            area < 0 /* antimeridian crossing */ ? -180 + longitude / f : longitude / f
        );
    }

    private sortCCW() {
        const polyCenter = this.getPolyAverageCenter();
        if (!polyCenter) {
            return;
        }

        //sorts by angle from x-axis
        this.m_coordinates.sort((a: GeoCoordinatesLike, b: GeoCoordinatesLike) => {
            const veca = new Vector2(
                a.latitude - polyCenter.latitude,
                a.longitude - polyCenter.longitude
            ).normalize();
            const vecb = new Vector2(
                b.latitude - polyCenter.latitude,
                b.longitude - polyCenter.longitude
            ).normalize();

            return vecb.angle() - veca.angle();
        });
    }

    private wrapCoordinatesAround() {
        const antimerCrossIndex = this.m_coordinates.findIndex(
            (val: GeoCoordinatesLike, index: number) => {
                const prevLonIndex = index === 0 ? this.m_coordinates.length - 1 : index - 1;
                const prevLon = this.m_coordinates[prevLonIndex].longitude;
                const lon = val.longitude;

                return prevLon > 90 && lon < -90;
            }
        );
        if (antimerCrossIndex < 0) {
            return;
        }

        for (let i = 0; i < this.m_coordinates.length; i++) {
            const index = (antimerCrossIndex + i) % this.m_coordinates.length;
            const currentLon = this.m_coordinates[index].longitude;
            this.m_coordinates[index].longitude += 360;
            const nextLon = this.m_coordinates[(index + 1) % this.m_coordinates.length].longitude;

            if (currentLon < -90 && nextLon > 90) {
                // new crossing in opposite direction, stop.
                break;
            }
        }
    }

    private getPolyAverageCenter(): GeoCoordinates | undefined {
        const polySum = this.m_coordinates.reduce((prev, curr) => {
            return new GeoCoordinates(
                prev.latitude + curr.latitude,
                prev.longitude + curr.longitude
            );
        });
        //create an average center point
        return new GeoCoordinates(
            polySum.latitude / this.m_coordinates.length,
            polySum.longitude / this.m_coordinates.length
        );
    }

    private getArea(): number {
        let area = 0;
        let previousIndex = this.m_coordinates.length - 1;

        this.m_coordinates.forEach((coordinate, index) => {
            const previousCoordinate = this.m_coordinates[previousIndex];
            area += coordinate.latitude * previousCoordinate.longitude;
            area -= coordinate.longitude * previousCoordinate.latitude;
            previousIndex = index;
        });

        return (area /= 2);
    }

    private getEastAndWest(center: GeoCoordinates): { east: number; west: number } {
        let west = center.longitude;
        let east = center.longitude;
        let previousIndex = this.m_coordinates.length - 1;
        this.m_coordinates.forEach((coordinate, index) => {
            const previousCoordinate = this.m_coordinates[previousIndex];
            previousIndex = index;
            const veca = new Vector2(
                coordinate.latitude - center.latitude,
                coordinate.longitude - center.longitude
            ).normalize();

            const vecb = new Vector2(
                previousCoordinate.latitude - center.latitude,
                previousCoordinate.longitude - center.longitude
            ).normalize();

            let ccw = Math.sign(vecb.angle() - veca.angle()) === 1;
            // overwrite in case of angle over axis
            if (vecb.y >= 0 && veca.y < 0) {
                ccw = true;
            }

            const long = coordinate.longitude;
            if (long < center.longitude) {
                if (ccw) {
                    west = Math.min(west, long);
                } else {
                    east = Math.min(east, long);
                }
            } else {
                if (ccw) {
                    east = Math.max(east, long);
                } else {
                    west = Math.max(west, long);
                }
            }
        });
        return { east, west };
    }

    private getNorthAndSouth(): { north: number; south: number } {
        let north = MIN_LATITUDE;
        let south = MAX_LATITUDE;
        this.m_coordinates.forEach((coordinate, index) => {
            north = Math.max(north, coordinate.latitude);
            south = Math.min(south, coordinate.latitude);
        });
        return { north, south };
    }
}
