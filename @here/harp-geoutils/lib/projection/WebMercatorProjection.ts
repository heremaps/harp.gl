/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { isOrientedBox3Like, OrientedBox3Like } from "../math/OrientedBox3Like";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { MercatorProjection } from "./MercatorProjection";
import { Projection } from "./Projection";

class WebMercatorProjection extends MercatorProjection {
    static readonly MAXIMUM_LATITUDE: number = 1.4844222297453323;

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
            // tslint:disable-next-line:no-object-literal-type-assertion
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }

        result.x = ((geoPoint.longitude + 180) / 360) * EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const sy = Math.sin(MercatorProjection.latitudeClamp(geoPoint.latitudeInRadians));
        result.y =
            (0.5 - Math.log((1 + sy) / (1 - sy)) / (4 * Math.PI)) *
            EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const x = worldPoint.x / EarthConstants.EQUATORIAL_CIRCUMFERENCE - 0.5;
        const y = 0.5 - worldPoint.y / EarthConstants.EQUATORIAL_CIRCUMFERENCE;

        const longitude = 360 * x;
        const latitude = 90 - (360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI;

        return new GeoCoordinates(latitude, longitude, worldPoint.z);
    }

    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const r = super.projectBox(geoBox, result);
        if (isOrientedBox3Like(r)) {
            MathUtils.newVector3(1, 0, 0, r.xAxis);
            MathUtils.newVector3(0, -1, 0, r.yAxis);
            MathUtils.newVector3(0, 0, -1, r.zAxis);
        }
        return r;
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        const geoBox = new GeoBox(
            new GeoCoordinates(maxGeo.latitude, minGeo.longitude, minGeo.altitude),
            new GeoCoordinates(minGeo.latitude, maxGeo.longitude, maxGeo.altitude)
        );
        return geoBox;
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
}

/**
 * Web Mercator [[Projection]] used to convert geo coordinates to world coordinates and vice versa.
 */
export const webMercatorProjection: Projection = new WebMercatorProjection();
