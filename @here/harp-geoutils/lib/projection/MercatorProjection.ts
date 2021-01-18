/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike, isGeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like, isBox3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { isOrientedBox3Like, OrientedBox3Like } from "../math/OrientedBox3Like";
import { TransformLike } from "../math/TransformLike";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { Projection, ProjectionType } from "./Projection";

class MercatorProjection extends Projection {
    protected static clamp(val: number, min: number, max: number): number {
        return Math.min(Math.max(min, val), max);
    }

    protected static latitudeClamp(latitude: number): number {
        return MercatorProjection.clamp(
            latitude,
            -MercatorConstants.MAXIMUM_LATITUDE,
            MercatorConstants.MAXIMUM_LATITUDE
        );
    }

    private static latitudeProject(latitude: number): number {
        return Math.log(Math.tan(Math.PI * 0.25 + latitude * 0.5)) / Math.PI;
    }

    private static latitudeClampProject(latitude: number): number {
        return MercatorProjection.latitudeProject(MercatorProjection.latitudeClamp(latitude));
    }

    private static unprojectLatitude(y: number): number {
        return 2.0 * Math.atan(Math.exp(Math.PI * y)) - Math.PI * 0.5;
    }

    /** @override */
    readonly type: ProjectionType = ProjectionType.Planar;

    /** @override */
    getScaleFactor(worldPoint: Vector3Like): number {
        return Math.cosh(2 * Math.PI * (worldPoint.y / this.unitScale - 0.5));
    }

    /** @override */
    worldExtent<WorldBoundingBox extends Box3Like>(
        minAltitude: number,
        maxAltitude: number,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        if (!result) {
            result = (new THREE.Box3() as Box3Like) as WorldBoundingBox;
        }
        result.min.x = 0;
        result.min.y = 0;
        result.min.z = minAltitude;
        result.max.x = this.unitScale;
        result.max.y = this.unitScale;
        result.max.z = maxAltitude;
        return result;
    }

    /** @override */
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
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }
        result.x = ((geoPoint.longitude + 180) / 360) * this.unitScale;
        result.y =
            (MercatorProjection.latitudeClampProject(geoPoint.latitudeInRadians) * 0.5 + 0.5) *
            this.unitScale;
        result.z = geoPoint.altitude ?? 0;
        return result;
    }

    /** @override */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const geoPoint = GeoCoordinates.fromRadians(
            MercatorProjection.unprojectLatitude((worldPoint.y / this.unitScale - 0.5) * 2.0),
            (worldPoint.x / this.unitScale) * 2 * Math.PI - Math.PI,
            worldPoint.z
        );
        return geoPoint;
    }

    /** @override */
    unprojectAltitude(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }

    /** @override */
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const worldCenter = this.projectPoint(geoBox.center);
        const worldNorth =
            (MercatorProjection.latitudeClampProject(geoBox.northEast.latitudeInRadians) * 0.5 +
                0.5) *
            this.unitScale;
        const worldSouth =
            (MercatorProjection.latitudeClampProject(geoBox.southWest.latitudeInRadians) * 0.5 +
                0.5) *
            this.unitScale;
        const worldYCenter = (worldNorth + worldSouth) * 0.5;

        worldCenter.y = worldYCenter;

        const latitudeSpan = worldNorth - worldSouth;
        const longitudeSpan = (geoBox.longitudeSpan / 360) * this.unitScale;
        if (!result) {
            result = (new THREE.Box3() as Box3Like) as WorldBoundingBox;
        }
        if (isBox3Like(result)) {
            result.min.x = worldCenter.x - longitudeSpan * 0.5;
            result.min.y = worldCenter.y - latitudeSpan * 0.5;
            result.max.x = worldCenter.x + longitudeSpan * 0.5;
            result.max.y = worldCenter.y + latitudeSpan * 0.5;
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
            result.extents.x = longitudeSpan * 0.5;
            result.extents.y = latitudeSpan * 0.5;
            result.extents.z = Math.max(Number.EPSILON, (geoBox.altitudeSpan ?? 0) * 0.5);
        } else {
            throw new Error("invalid bounding box");
        }
        return result;
    }

    /** @override */
    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        const geoBox = GeoBox.fromCoordinates(minGeo, maxGeo);
        return geoBox;
    }

    /** @override */
    groundDistance(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }

    /** @override */
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        worldPoint.z = 0;
        return worldPoint;
    }

    /** @override */
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

    /** @override */
    reprojectPoint(
        sourceProjection: Projection,
        worldPos: Vector3Like,
        result?: Vector3Like
    ): Vector3Like {
        // this implementation of [[reprojectPoint]] supports both
        // [[WebMercatorProjection]] and [[MercatorProjection]]. The only
        // difference betweeen these two variants of WEB Mercator
        // is in the orientation of the Y axis, so we just flip Y coordinates
        // when reprojecting between them.
        if (
            sourceProjection !== this &&
            (sourceProjection === webMercatorProjection || sourceProjection === mercatorProjection)
        ) {
            if (result === undefined) {
                result = {} as Vector3Like;
            }

            result.x = worldPos.x;
            result.y = this.unitScale - worldPos.y;
            result.z = worldPos.z;

            return result;
        }

        return super.reprojectPoint(sourceProjection, worldPos, result!);
    }
}

class WebMercatorProjection extends MercatorProjection {
    /** @override */
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

        /*
         * The following tslint:disable is due to the fact that the [[WorldCoordinates]]
         * might be a concrete class which is not available at runtime.
         * Consider the following example:
         *
         *  const x: THREE.Vector3 = new THREE.Vector3(0,0,0);
         *  const result = EquirectangularProjection.projectPoint<THREE.Vector3>(x);
         *
         * Note: type of `result` is Vector3Like and not as expected: THREE.Vector3!
         */
        if (!result) {
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }

        result.x = ((geoPoint.longitude + 180) / 360) * this.unitScale;
        const sy = Math.sin(MercatorProjection.latitudeClamp(geoPoint.latitudeInRadians));
        result.y = (0.5 - Math.log((1 + sy) / (1 - sy)) / (4 * Math.PI)) * this.unitScale;
        result.z = geoPoint.altitude ?? 0;
        return result;
    }

    /** @override */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const x = worldPoint.x / this.unitScale - 0.5;
        const y = 0.5 - worldPoint.y / this.unitScale;

        const longitude = 360 * x;
        const latitude = 90 - (360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI;

        return new GeoCoordinates(latitude, longitude, worldPoint.z);
    }

    /** @override */
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const r = super.projectBox(geoBox, result);
        if (isBox3Like(r)) {
            // Invert the y axis for web mercator, this means that max => min & min => max
            const maxY = r.max.y;
            r.max.y = this.unitScale - r.min.y;
            r.min.y = this.unitScale - maxY;
        } else if (isOrientedBox3Like(r)) {
            MathUtils.newVector3(1, 0, 0, r.xAxis);
            MathUtils.newVector3(0, -1, 0, r.yAxis);
            MathUtils.newVector3(0, 0, -1, r.zAxis);
            r.position.y = this.unitScale - r.position.y;
        }
        return r;
    }

    /** @override */
    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        const geoBox = new GeoBox(
            new GeoCoordinates(maxGeo.latitude, minGeo.longitude, minGeo.altitude),
            new GeoCoordinates(minGeo.latitude, maxGeo.longitude, maxGeo.altitude)
        );
        return geoBox;
    }

    /** @override */
    surfaceNormal(_worldPoint: Vector3Like, normal?: Vector3Like) {
        if (normal === undefined) {
            normal = { x: 0, y: 0, z: -1 };
        } else {
            normal.x = 0;
            normal.y = 0;
            normal.z = -1;
        }
        return normal;
    }

    /** @override */
    localTangentSpace(
        point: GeoCoordinatesLike | Vector3Like,
        result: TransformLike
    ): TransformLike {
        if (isGeoCoordinatesLike(point)) {
            this.projectPoint(point, result.position);
        } else {
            MathUtils.copyVector3(point, result.position);
        }
        MathUtils.newVector3(1, 0, 0, result.xAxis);
        MathUtils.newVector3(0, -1, 0, result.yAxis);
        MathUtils.newVector3(0, 0, -1, result.zAxis);
        return result;
    }
}

export class MercatorConstants {
    // Math.atan(Math.sinh(Math.PI))
    static readonly MAXIMUM_LATITUDE: number = 1.4844222297453323;
}

/**
 * Mercator {@link Projection} used to convert geo coordinates to world coordinates and vice versa.
 */
export const mercatorProjection: Projection = new MercatorProjection(
    EarthConstants.EQUATORIAL_CIRCUMFERENCE
);

/**
 * Web Mercator {@link Projection} used to convert geo coordinates to world coordinates
 * and vice versa.
 */
export const webMercatorProjection: Projection = new WebMercatorProjection(
    EarthConstants.EQUATORIAL_CIRCUMFERENCE
);
