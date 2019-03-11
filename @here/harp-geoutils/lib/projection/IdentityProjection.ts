/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { Vector3Like } from "../math/Vector3Like";
import { Projection } from "./Projection";

const DEG2RAD = Math.PI / 180;

class IdentityProjection implements Projection {
    getScaleFactor<WorldCoordinates extends Vector3Like>(_worldPoint: WorldCoordinates): number {
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
        result.min.x = -Math.PI;
        result.min.y = -Math.PI * 0.5;
        result.min.z = minAltitude;
        result.max.x = Math.PI;
        result.max.y = Math.PI * 0.5;
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
        result.x = geoPoint.longitude * DEG2RAD;
        result.y = geoPoint.latitude * DEG2RAD;
        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const geoPoint = GeoCoordinates.fromRadians(worldPoint.y, worldPoint.x, worldPoint.z);
        return geoPoint;
    }

    projectBox<WorldBoundingBox extends Box3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        this.projectPoint(
            new GeoCoordinates(geoBox.south, geoBox.west, geoBox.minAltitude),
            result.min
        );
        this.projectPoint(
            new GeoCoordinates(geoBox.north, geoBox.east, geoBox.maxAltitude),
            result.max
        );
        return result;
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        return GeoBox.fromCoordinates(minGeo, maxGeo);
    }
}

/**
 * Identity [[Projection]] used to convert geo coordinates to world coordinates and vice versa.
 */
export const identityProjection: Projection = new IdentityProjection();
