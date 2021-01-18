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
import { Projection, ProjectionType } from "./Projection";

class IdentityProjection extends Projection {
    /** @override */
    readonly type: ProjectionType = ProjectionType.Planar;

    /** @override */
    getScaleFactor(_worldPoint: Vector3Like): number {
        return 1;
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
        result.min.x = -Math.PI;
        result.min.y = -Math.PI * 0.5;
        result.min.z = minAltitude;
        result.max.x = Math.PI;
        result.max.y = Math.PI * 0.5;
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
        result.x = THREE.MathUtils.degToRad(geoPoint.longitude);
        result.y = THREE.MathUtils.degToRad(geoPoint.latitude);
        result.z = geoPoint.altitude ?? 0;
        return result;
    }

    /** @override */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const geoPoint = GeoCoordinates.fromRadians(worldPoint.y, worldPoint.x, worldPoint.z);
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
        if (!result) {
            result = (new THREE.Box3() as Box3Like) as WorldBoundingBox;
        }
        const min = this.projectPoint(
            new GeoCoordinates(geoBox.south, geoBox.west, geoBox.minAltitude)
        );
        const max = this.projectPoint(
            new GeoCoordinates(geoBox.north, geoBox.east, geoBox.maxAltitude)
        );
        if (isBox3Like(result)) {
            result.min.x = min.x;
            result.min.y = min.y;
            result.min.z = min.z;
            result.max.x = max.x;
            result.max.y = max.y;
            result.max.z = max.z;
        } else if (isOrientedBox3Like(result)) {
            MathUtils.newVector3(1, 0, 0, result.xAxis);
            MathUtils.newVector3(0, 1, 0, result.yAxis);
            MathUtils.newVector3(0, 0, 1, result.zAxis);
            result.position.x = (min.x + max.x) * 0.5;
            result.position.y = (min.y + max.y) * 0.5;
            result.position.z = (min.z + max.z) * 0.5;
            result.extents.x = (max.x - min.x) * 0.5;
            result.extents.y = (max.y - min.y) * 0.5;
            result.extents.z = Math.max(Number.EPSILON, (max.z - min.z) * 0.5);
        }
        return result;
    }

    /** @override */
    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        return GeoBox.fromCoordinates(minGeo, maxGeo);
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
}

/**
 * Identity {@link Projection} used to convert geo coordinates to unit coordinates and vice versa.
 */
export const identityProjection: Projection = new IdentityProjection(1);
