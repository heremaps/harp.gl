import { Projection, ProjectionType } from "./Projection";

import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like, isBox3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { isOrientedBox3Like, OrientedBox3Like } from "../math/OrientedBox3Like";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";

export class CylindricalProjection extends Projection {
    get type(): ProjectionType {
        return ProjectionType.Planar;
    }
    worldExtent<Bounds extends Box3Like>(
        minElevation: number,
        maxElevation: number,
        result?: Bounds | undefined
    ): Bounds {
        if (!result) {
            result = MathUtils.newEmptyBox3() as Bounds;
        }
        result.min.x = 0;
        result.min.y = 0;
        result.min.z = minElevation;
        result.max.x = EarthConstants.EQUATORIAL_RADIUS;
        result.max.y = EarthConstants.EQUATORIAL_RADIUS;
        result.max.z = maxElevation;
        return result;
    }
    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPointLike: GeoCoordinatesLike,
        result?: WorldCoordinates | undefined
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
        result.x = (geoPoint.longitude / 360) * EarthConstants.EQUATORIAL_RADIUS;
        result.y =
            Math.tan(MathUtils.degToRad(geoPoint.latitude)) * EarthConstants.EQUATORIAL_RADIUS;
        result.z = geoPoint.altitude || 0;
        return result;
    }
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const geoPoint = GeoCoordinates.fromRadians(
            Math.atan(worldPoint.y / EarthConstants.EQUATORIAL_RADIUS),
            MathUtils.degToRad((360 * worldPoint.x) / EarthConstants.EQUATORIAL_RADIUS - 180),
            worldPoint.z
        );
        return geoPoint;
    }
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const worldCenter = this.projectPoint(geoBox.center);
        const worldNorthEast = this.projectPoint(geoBox.northEast);
        const worldSouthWest = this.projectPoint(geoBox.southWest);
        const worldYCenter = (worldNorthEast.y + worldSouthWest.y) * 0.5;

        worldCenter.y = worldYCenter;

        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
        if (isBox3Like(result)) {
            result.min.x = worldSouthWest.x;
            result.min.y = worldSouthWest.y;
            result.max.x = worldNorthEast.x;
            result.max.y = worldNorthEast.y;
            result.min.z = 0;
            result.max.z = 0;
        } else if (isOrientedBox3Like(result)) {
            throw new Error("here fix me bor");
            // MathUtils.newVector3(1, 0, 0, result.xAxis);
            // MathUtils.newVector3(0, 1, 0, result.yAxis);
            // MathUtils.newVector3(0, 0, 1, result.zAxis);
            // result.position.x = worldCenter.x;
            // result.position.y = worldCenter.y;
            // result.position.z = worldCenter.z;
            // result.extents.x = longitudeSpan * 0.5;
            // result.extents.y = latitudeSpan * 0.5;
            // result.extents.z = Math.max(Number.EPSILON, (geoBox.altitudeSpan || 0) * 0.5);
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
    getScaleFactor(worldPoint: Vector3Like): number {
        return 1;
    }
    surfaceNormal(worldPoint: Vector3Like, result?: Vector3Like): Vector3Like {
        if (result === undefined) {
            result = { x: 0, y: 0, z: 1 };
        } else {
            result.x = 0;
            result.y = 0;
            result.z = 1;
        }
        return result;
    }
    groundDistance(worldPoint: Vector3Like): number {
        return worldPoint.z;
    }
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        worldPoint.z = 0;
        return worldPoint;
    }
}

export const cylindricalProjection = new CylindricalProjection();
