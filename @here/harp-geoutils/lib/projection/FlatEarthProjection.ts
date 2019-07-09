/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like, isBox3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { isOrientedBox3Like, OrientedBox3Like } from "../math/OrientedBox3Like";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { Projection, ProjectionType } from "./Projection";

class FlatEarthProjection extends Projection {
    static MAXIMUM_LATITUDE: number = 1.4844222297453323;

    readonly type: ProjectionType = ProjectionType.Planar;

    getScaleFactor(worldPoint: Vector3Like): number {
        return 1.0;
    }

    worldExtent<WorldBoundingBox extends Box3Like>(
        minAltitude: number,
        maxAltitude: number,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        result.min.x = 0;
        result.min.y = 0;
        result.min.z = minAltitude;
        result.max.x = this.unitScale;
        result.max.y = this.unitScale;
        result.max.z = maxAltitude;
        return result;
    }

    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPointLike: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        let geoPoint: GeoCoordinates;

        if (geoPointLike instanceof GeoCoordinates) {
            geoPoint = geoPointLike;
        } else {
            geoPoint = new GeoCoordinates(
                geoPointLike.latitude,
                geoPointLike.longitude,
                geoPointLike.altitude
            );
        }

        if (!result) {
            // tslint:disable-next-line:no-object-literal-type-assertion
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }
        const R = (90 - geoPoint.latitudeInDegrees) / 180.0;
        const alpha = geoPoint.longitudeInRadians;

        result.x = Math.cos(alpha) * R * this.unitScale;
        result.y = Math.sin(alpha) * R * this.unitScale;
        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const R =
            Math.sqrt(worldPoint.x * worldPoint.x + worldPoint.y * worldPoint.y) / this.unitScale;
        const lat = Math.PI / 2 - R * Math.PI;
        const lng = Math.atan2(worldPoint.y, worldPoint.x);

        const geoPoint = GeoCoordinates.fromRadians(lat, lng, worldPoint.z);
        return geoPoint;
    }

    unprojectAltitude(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }

    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const worldCenter = this.projectPoint(geoBox.center);
        const west = geoBox.west;
        const east = geoBox.east;
        const south = geoBox.south;
        const north = geoBox.north;

        const worldNorthWest = this.projectPoint(new GeoCoordinates(north, west));
        const worldNorthEast = this.projectPoint(new GeoCoordinates(north, east));
        const worldSouthWest = this.projectPoint(new GeoCoordinates(south, west));
        const worldSouthEast = this.projectPoint(new GeoCoordinates(south, east));

        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        if (isBox3Like(result)) {
            result.min.x = Math.min(
                worldNorthWest.x,
                worldNorthEast.x,
                worldSouthWest.x,
                worldSouthEast.x
            );
            result.min.y = Math.min(
                worldNorthWest.y,
                worldNorthEast.y,
                worldSouthWest.y,
                worldSouthEast.y
            );
            result.max.x = Math.max(
                worldNorthWest.x,
                worldNorthEast.x,
                worldSouthWest.x,
                worldSouthEast.x
            );
            result.max.y = Math.max(
                worldNorthWest.y,
                worldNorthEast.y,
                worldSouthWest.y,
                worldSouthEast.y
            );
            const altitudeSpan = geoBox.altitudeSpan;
            if (altitudeSpan !== undefined) {
                result.min.z = worldCenter.z - altitudeSpan * 0.5;
                result.max.z = worldCenter.z + altitudeSpan * 0.5;
            } else {
                result.min.z = 0;
                result.max.z = 0;
            }
        } else if (isOrientedBox3Like(result)) {
            MathUtils.newVector3(1, 0, 0, result.xAxis);
            MathUtils.newVector3(0, 1, 0, result.yAxis);
            MathUtils.newVector3(0, 0, 1, result.zAxis);
            result.position.x = worldCenter.x;
            result.position.y = worldCenter.y;
            result.position.z = worldCenter.z;
            result.extents.x = (worldNorthEast.x - worldNorthWest.x) * 0.5;
            result.extents.y = (worldNorthEast.y - worldSouthWest.y) * 0.5;
            result.extents.z = Math.max(Number.EPSILON, (geoBox.altitudeSpan || 0) * 0.5);
        } else {
            throw new Error("invalid bounding box");
        }
        return result;
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        const geoBox = GeoBox.fromCoordinates(minGeo, maxGeo);
        return geoBox;
    }

    groundDistance(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }

    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        worldPoint.z = 0;
        return worldPoint;
    }

    surfaceNormal(_worldPoint: Vector3Like, normal?: Vector3Like) {
        if (normal === undefined) {
            normal = { x: 0, y: 0, z: 1 };
        } else {
            normal.x = 0;
            normal.y = 0;
            normal.z = 1;
        }
        return normal;
    }
}

/**
 * Mercator [[Projection]] used to convert geo coordinates to world coordinates and vice versa.
 */
export const flatEarthProjection: Projection = new FlatEarthProjection(
    EarthConstants.EQUATORIAL_CIRCUMFERENCE
);
