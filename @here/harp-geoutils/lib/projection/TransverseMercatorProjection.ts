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

/**
 *
 * https://en.wikipedia.org/wiki/Transverse_Mercator_projection
 * http://mathworld.wolfram.com/MercatorProjection.html
 *
 */
export class TransverseMercatorProjection extends Projection {
    static POLE_RADIUS: number = 90 - 85.05112877980659;
    static POLE_RADIUS_SQ: number = Math.pow(TransverseMercatorProjection.POLE_RADIUS, 2);

    /**
     * Like in regular Mercator projection, there are two points on sphere
     * with radius about 5 degrees, that is out of projected space.
     *
     *
     * in regular Mercator these points are:
     *     (90, any), (-90, any)
     *
     * and in transverse Mercator:
     *     (0, 90), (0, -90)
     *
     * So, in transverse we need to compute distnce to poles, and clamp if
     * radius is exceeded
     */
    static clampGeoPoint(geoPoint: GeoCoordinatesLike, unitScale: number) {
        const lat = geoPoint.latitude;
        const lon = geoPoint.longitude;

        const r = TransverseMercatorProjection.POLE_RADIUS;
        const rsq = TransverseMercatorProjection.POLE_RADIUS_SQ;

        const dx0 = lon - 90;
        const dy0 = lat - 0;
        const ds0 = dx0 * dx0 + dy0 * dy0;
        if (ds0 < rsq) {
            const dist = Math.sqrt(ds0);
            const scale = (r - dist) / dist;
            const dx = dx0 === 0 && dy0 === 0 ? -r : dx0;
            return new GeoCoordinates(lat + dy0 * scale, lon + dx * scale);
        }

        const dx1 = lon - -90;
        const dy1 = lat - 0;
        const ds1 = dx1 * dx1 + dy1 * dy1;
        if (ds1 < rsq) {
            const dist = Math.sqrt(ds1);
            const scale = (r - dist) / dist;
            const dx = dx1 === 0 && dy1 === 0 ? r : dx1;
            return new GeoCoordinates(lat + dy1 * scale, lon + dx * scale);
        }

        return geoPoint;
    }

    readonly type: ProjectionType = ProjectionType.Planar;

    private m_phi0: number = 0;
    private m_lambda0: number = 0;

    constructor(readonly unitScale: number) {
        super(unitScale);
    }

    getScaleFactor(worldPoint: Vector3Like): number {
        return Math.cosh((worldPoint.x / this.unitScale - 0.5) * 2 * Math.PI);
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
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        if (!result) {
            // tslint:disable-next-line:no-object-literal-type-assertion
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }

        const clamped = TransverseMercatorProjection.clampGeoPoint(geoPoint, this.unitScale);
        const phi = MathUtils.degToRad(clamped.latitude);
        const lambda = MathUtils.degToRad(clamped.longitude);

        const B = Math.cos(phi) * Math.sin(lambda - this.m_lambda0);
        // result.x = 1/2 * Math.log((1 + B) / (1 - B));
        result.x = Math.atanh(B);
        result.y = Math.atan2(Math.tan(phi), Math.cos(lambda - this.m_lambda0)) - this.m_phi0;

        result.x = (result.x / (Math.PI * 2) + 0.5) * this.unitScale;
        result.y = (result.y / (Math.PI * 2) + 0.5) * this.unitScale;

        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const x = (worldPoint.x / this.unitScale - 0.5) * Math.PI * 2;
        const y = (worldPoint.y / this.unitScale - 0.5) * Math.PI * 2;
        const z = worldPoint.z || 0;

        const D = y + this.m_phi0;

        const phi = Math.asin(Math.sin(D) / Math.cosh(x));
        const lambda = this.m_lambda0 + Math.atan2(Math.sinh(x), Math.cos(D));

        const geoPoint = GeoCoordinates.fromRadians(phi, lambda, z);
        return geoPoint;
    }

    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const { north, south, east, west } = geoBox;

        const points = [
            geoBox.center,
            geoBox.northEast,
            geoBox.southWest,
            new GeoCoordinates(south, east),
            new GeoCoordinates(north, west)
        ];

        this.alignLatitude(points, points[0]);

        const projected = points.map(p => this.projectPoint(p));
        const vx = projected.map(p => p.x);
        const vy = projected.map(p => p.y);
        const vz = projected.map(p => p.z);

        const minX = Math.min(...vx);
        const minY = Math.min(...vy);
        const minZ = Math.min(...vz);
        const maxX = Math.max(...vx);
        const maxY = Math.max(...vy);
        const maxZ = Math.max(...vz);

        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        if (isBox3Like(result)) {
            result.min.x = minX;
            result.min.y = minY;
            result.min.z = minZ;
            result.max.x = maxX;
            result.max.y = maxY;
            result.max.z = maxZ;
        } else if (isOrientedBox3Like(result)) {
            MathUtils.newVector3(1, 0, 0, result.xAxis);
            MathUtils.newVector3(0, 1, 0, result.yAxis);
            MathUtils.newVector3(0, 0, 1, result.zAxis);
            result.position.x = (minX + maxX) / 2;
            result.position.y = (minX + maxX) / 2;
            result.position.z = (minX + maxX) / 2;
            result.extents.x = (maxX - minX) / 2;
            result.extents.y = (maxX - minX) / 2;
            result.extents.z = (maxX - minX) / 2;
        } else {
            throw new Error("invalid bounding box");
        }
        return result;
    }

    /**
     * There are 8 sub-regions on entire projection space
     * where both longitude and latitude preserve direction.
     * If bounding box hits more than one region, it should be splitted
     * into sub-boxes by regions, (un)projected and then united again.
     *
     *
     * directions in form [latitude / longitude]:
     *    1 ┌─────────|─────────┐
     *      │ dr / dl | dl / ul │
     * 0.75 ----------|----------
     *      │ ur / dr | ul / ur │
     * 0.5  ----------|----------
     *      │ ul / ur | ur / dr │
     * 0.25 ----------|----------
     *      │ dl / ul | dr / dl │
     *      └─────────|─────────┘
     *     0         0.5        1
     */
    unprojectBox(worldBox: Box3Like): GeoBox {
        const s = this.unitScale;

        const min = worldBox.min;
        const max = worldBox.max;
        const pointsToCheck = [
            { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: 0 },
            min,
            max,
            { x: min.x, y: max.y, z: 0 },
            { x: max.x, y: min.y, z: 0 }
        ];

        const center = 0.5 * s;
        const lowerQ = 0.25 * s;
        const upperQ = 0.75 * s;

        const containsCenterX = min.x < center && max.x > center;
        const containsCenterY = min.y < center && max.y > center;
        const containsLowerQY = min.y < lowerQ && max.y > lowerQ;
        const containsUpperQY = min.y < upperQ && max.y > upperQ;

        if (containsCenterY) {
            pointsToCheck.push({ x: min.x, y: center, z: 0 });
            pointsToCheck.push({ x: max.x, y: center, z: 0 });

            if (containsCenterX) {
                pointsToCheck.push({ x: center, y: center, z: 0 });
            }
        }
        if (containsLowerQY) {
            pointsToCheck.push({ x: min.x, y: lowerQ, z: 0 });
            pointsToCheck.push({ x: max.x, y: lowerQ, z: 0 });

            if (containsCenterX) {
                pointsToCheck.push({ x: center, y: lowerQ, z: 0 });
            }
        }
        if (containsUpperQY) {
            pointsToCheck.push({ x: min.x, y: upperQ, z: 0 });
            pointsToCheck.push({ x: max.x, y: upperQ, z: 0 });

            if (containsCenterX) {
                pointsToCheck.push({ x: center, y: upperQ, z: 0 });
            }
        }

        const geoPoints = pointsToCheck.map(p => this.unprojectPoint(p));
        this.alignLongitude(geoPoints, geoPoints[0]);

        const latitudes = geoPoints.map(g => g.latitude);
        const longitudes = geoPoints.filter(g => Math.abs(g.latitude) < 90).map(g => g.longitude);
        const altitudes = geoPoints.map(g => g.altitude || 0);

        const minGeo = new GeoCoordinates(
            Math.min(...latitudes),
            Math.min(...longitudes),
            Math.min(...altitudes)
        );

        const maxGeo = new GeoCoordinates(
            Math.max(...latitudes),
            Math.max(...longitudes),
            Math.max(...altitudes)
        );

        const geoBox = GeoBox.fromCoordinates(minGeo, maxGeo);
        return geoBox;
    }

    unprojectAltitude(worldPoint: Vector3Like): number {
        return worldPoint.z;
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
            normal = { x: 0, y: 0, z: -1 };
        } else {
            normal.x = 0;
            normal.y = 0;
            normal.z = -1;
        }
        return normal;
    }

    /**
     * There are two regions on projected space that have same geo coordinates,
     * it's the entire lines   { x: [0..1], y: 0 } and { x: [0..1], y: 1 }
     * they both have geo coordinates of   (0, [-90..+90])
     * and should be aligned somehow to fall into first or second region
     * to make proper bounding boxes, tile bounds, etc.
     */
    alignLatitude(points: GeoCoordinatesLike[], referencePoint: GeoCoordinatesLike): void {
        const EPSILON = 1e-9;

        for (const point of points) {
            if (point.latitude === 0) {
                point.latitude = referencePoint.latitude * EPSILON;
            }
        }
    }

    /**
     * There are two regions on projected plane,
     * { x: 0.5, y: [0..0.25] }    and    { x: 0.5, y: [0.75..1] }
     * that represent longitude edge where -180 and +180 met.
     * Points falling in this regions should be aligned to get proper boxes etc.
     */
    alignLongitude(points: GeoCoordinatesLike[], referencePoint: GeoCoordinatesLike): void {
        const bad = referencePoint.longitude < 0 ? 180 : -180;
        const good = referencePoint.longitude < 0 ? -180 : 180;

        for (const point of points) {
            if (point.longitude === bad) {
                point.longitude = good;
            }
        }
    }
}

/**
 * Transverse Mercator [[Projection]] used to convert geo coordinates to world coordinates
 * and vice versa.
 */
export const transverseMercatorProjection: Projection = new TransverseMercatorProjection(
    EarthConstants.EQUATORIAL_CIRCUMFERENCE
);
