/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

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
class TransverseMercatorProjection extends Projection {
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
    static clampGeoPoint(geoPoint: GeoCoordinatesLike, _unitScale: number) {
        const lat = geoPoint.latitude;
        const lon = geoPoint.longitude;

        const r = TransverseMercatorUtils.POLE_RADIUS;
        const rsq = TransverseMercatorUtils.POLE_RADIUS_SQ;

        const nearestQuarter = Math.round(lon / 90);
        const deltaLon = nearestQuarter * 90 - lon;
        if (nearestQuarter % 2 === 0 || Math.abs(deltaLon) > r) {
            return geoPoint;
        }

        const deltaLat = lat - 0;
        const distanceToPoleSq = deltaLon * deltaLon + deltaLat * deltaLat;
        if (distanceToPoleSq < rsq) {
            const distanceToPole = Math.sqrt(distanceToPoleSq);
            const scale = (r - distanceToPole) / distanceToPole;
            // const quarter = ((nearestQuarter % 4) + 4) % 4;
            // const dir = quarter === 1 ? -1 : quarter === 3 ? 1 : 0;
            const dir = 1;
            const offsetLon = deltaLon === 0 && deltaLat === 0 ? r * dir : deltaLon;
            return new GeoCoordinates(lat + deltaLat * scale, lon + offsetLon * scale);
        }

        return geoPoint;
    }

    /** @override */
    readonly type: ProjectionType = ProjectionType.Planar;

    private readonly m_phi0: number = 0;
    private readonly m_lambda0: number = 0;

    constructor(readonly unitScale: number) {
        super(unitScale);
    }

    /** @override */
    getScaleFactor(worldPoint: Vector3Like): number {
        return Math.cosh((worldPoint.x / this.unitScale - 0.5) * 2 * Math.PI);
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
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        if (!result) {
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }

        const clamped = TransverseMercatorProjection.clampGeoPoint(geoPoint, this.unitScale);
        const normalLon = clamped.longitude / 360 + 0.5;
        const offset = normalLon === 1 ? 0 : Math.floor(normalLon);
        const phi = THREE.MathUtils.degToRad(clamped.latitude);
        const lambda = THREE.MathUtils.degToRad(clamped.longitude - offset * 360) - this.m_lambda0;

        const B = Math.cos(phi) * Math.sin(lambda);
        // result.x = 1/2 * Math.log((1 + B) / (1 - B));
        result.x = Math.atanh(B);
        result.y = Math.atan2(Math.tan(phi), Math.cos(lambda)) - this.m_phi0;

        const outScale = 0.5 / Math.PI;
        result.x =
            this.unitScale * (THREE.MathUtils.clamp(result.x * outScale + 0.5, 0, 1) + offset);
        result.y = this.unitScale * THREE.MathUtils.clamp(result.y * outScale + 0.5, 0, 1);

        result.z = geoPoint.altitude ?? 0;
        return result;
    }

    /** @override */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const tau = Math.PI * 2;
        const nx = worldPoint.x / this.unitScale;
        const ny = worldPoint.y / this.unitScale;
        const offset = nx === 1 ? 0 : Math.floor(nx);
        const x = tau * (nx - 0.5 - offset);
        const y = tau * (ny - 0.5);
        const z = worldPoint.z || 0;

        const D = y + this.m_phi0;

        const phi = Math.asin(Math.sin(D) / Math.cosh(x));
        const lambda = this.m_lambda0 + Math.atan2(Math.sinh(x), Math.cos(D)) + offset * tau;

        const geoPoint = GeoCoordinates.fromRadians(phi, lambda, z);
        return geoPoint;
    }

    /** @override */
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const { north, south, east, west } = geoBox;

        const pointsToCheck = [
            geoBox.center,
            geoBox.northEast,
            geoBox.southWest,
            new GeoCoordinates(south, east),
            new GeoCoordinates(north, west)
        ];

        const E = TransverseMercatorUtils.POLE_EDGE_DEG;

        const containsWestCut = west < -90 && east > -90;
        const containsEastCut = west < 90 && east > 90;
        const containsCenterX = west < 0 && east > 0;
        const containsCenterY = west < E && east > -E && north > 0 && south < 0;

        if (containsWestCut) {
            pointsToCheck.push(new GeoCoordinates(north, -90));
            pointsToCheck.push(new GeoCoordinates(south, -90));
        }

        if (containsEastCut) {
            pointsToCheck.push(new GeoCoordinates(north, 90));
            pointsToCheck.push(new GeoCoordinates(south, 90));
        }

        if (containsCenterX) {
            pointsToCheck.push(new GeoCoordinates(north, 0));
            pointsToCheck.push(new GeoCoordinates(south, 0));
        }

        if (containsCenterY) {
            pointsToCheck.push(new GeoCoordinates(0, west));
            pointsToCheck.push(new GeoCoordinates(0, east));
        }

        TransverseMercatorUtils.alignLatitude(pointsToCheck, pointsToCheck[0]);

        const projected = pointsToCheck.map(p => this.projectPoint(p));
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
            result = (new THREE.Box3() as Box3Like) as WorldBoundingBox;
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
            result.position.y = (minY + maxY) / 2;
            result.position.z = (minZ + maxZ) / 2;
            result.extents.x = (maxX - minX) / 2;
            result.extents.y = (maxY - minY) / 2;
            result.extents.z = (maxZ - minZ) / 2;
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
     *     @override
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
        TransverseMercatorUtils.alignLongitude(geoPoints, geoPoints[0]);

        const latitudes = geoPoints.map(g => g.latitude);
        const longitudes = geoPoints.filter(g => Math.abs(g.latitude) < 90).map(g => g.longitude);
        const altitudes = geoPoints.map(g => g.altitude ?? 0);

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

    /** @override */
    unprojectAltitude(worldPoint: Vector3Like): number {
        return worldPoint.z;
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
            normal = { x: 0, y: 0, z: -1 };
        } else {
            normal.x = 0;
            normal.y = 0;
            normal.z = -1;
        }
        return normal;
    }
}

export class TransverseMercatorUtils {
    static POLE_EDGE: number = 1.4844222297453323;
    static POLE_EDGE_DEG: number = THREE.MathUtils.radToDeg(TransverseMercatorUtils.POLE_EDGE);
    static POLE_RADIUS: number = 90 - TransverseMercatorUtils.POLE_EDGE_DEG;
    static POLE_RADIUS_SQ: number = Math.pow(TransverseMercatorUtils.POLE_RADIUS, 2);

    /**
     * There are two regions on projected space that have same geo coordinates,
     * it's the entire lines   { x: [0..1], y: 0 } and { x: [0..1], y: 1 }
     * they both have geo coordinates of   (0, [-90..+90])
     * and should be aligned somehow to fall into first or second region
     * to make proper bounding boxes, tile bounds, etc.
     */
    static alignLatitude(points: GeoCoordinatesLike[], referencePoint: GeoCoordinatesLike): void {
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
    static alignLongitude(points: GeoCoordinatesLike[], referencePoint: GeoCoordinatesLike): void {
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
 * Transverse Mercator {@link Projection} used to convert geo coordinates to world coordinates
 * and vice versa.
 */
export const transverseMercatorProjection: Projection = new TransverseMercatorProjection(
    EarthConstants.EQUATORIAL_CIRCUMFERENCE
);
