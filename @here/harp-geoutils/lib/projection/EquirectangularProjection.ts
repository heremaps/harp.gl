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
import { Projection, ProjectionType } from "./Projection";

const DEG2RAD = Math.PI / 180;

class EquirectangularProjection implements Projection {
    static geoToWorldScale: number = 1.0 / (2.0 * Math.PI);
    static worldToGeoScale: number = (2.0 * Math.PI) / 1.0;

    readonly type: ProjectionType = ProjectionType.Planar;

    getScaleFactor(_worldPoint: Vector3Like): number {
        return 1;
    }

    worldExtent<WorldBoundingBox extends Box3Like>(
        minAltitude: number,
        maxAltitude: number,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        result.min.x = 0.0;
        result.min.y = 0.0;
        result.min.z = minAltitude;
        result.max.x = 1.0;
        result.max.y = 0.5;
        result.max.z = maxAltitude;
        return result;
    }

    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        if (result === undefined) {
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
            // tslint:disable-next-line:no-object-literal-type-assertion
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }
        result.x =
            (geoPoint.longitude * DEG2RAD + Math.PI) * EquirectangularProjection.geoToWorldScale;
        result.y =
            (geoPoint.latitude * DEG2RAD + Math.PI * 0.5) *
            EquirectangularProjection.geoToWorldScale;
        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const geoPoint = GeoCoordinates.fromRadians(
            worldPoint.y * EquirectangularProjection.worldToGeoScale - Math.PI * 0.5,
            worldPoint.x * EquirectangularProjection.worldToGeoScale - Math.PI,
            worldPoint.z
        );
        return geoPoint;
    }

    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const worldCenter = this.projectPoint(
            new GeoCoordinates(geoBox.center.latitude, geoBox.center.longitude, 0)
        );
        const { latitudeSpanInRadians, longitudeSpanInRadians, altitudeSpan } = geoBox;
        const sizeX = longitudeSpanInRadians * EquirectangularProjection.geoToWorldScale;
        const sizeY = latitudeSpanInRadians * EquirectangularProjection.geoToWorldScale;
        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        if (isBox3Like(result)) {
            result.min.x = worldCenter.x - sizeX * 0.5;
            result.min.y = worldCenter.y - sizeY * 0.5;
            result.max.x = worldCenter.x + sizeX * 0.5;
            result.max.y = worldCenter.y + sizeY * 0.5;
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
            result.extents.x = sizeX * 0.5;
            result.extents.y = sizeY * 0.5;
            result.extents.z = Math.max(Number.EPSILON, (altitudeSpan || 0) * 0.5);
        }
        return result;
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        return GeoBox.fromCoordinates(minGeo, maxGeo);
    }

    groundDistance(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }
}

/**
 * Equirectangular [[Projection]] used to convert geo coordinates to world coordinates and vice
 * versa.
 */
export const equirectangularProjection: Projection = new EquirectangularProjection();
