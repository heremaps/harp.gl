import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { Projection } from "./Projection";

export class MercatorProjection implements Projection {
    static MAXIMUM_LATITUDE: number = 1.4844222297453323;

    protected static clamp(val: number, min: number, max: number): number {
        return Math.min(Math.max(min, val), max);
    }

    protected static latitudeClamp(latitude: number): number {
        return MercatorProjection.clamp(
            latitude,
            -MercatorProjection.MAXIMUM_LATITUDE,
            MercatorProjection.MAXIMUM_LATITUDE
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

    getScaleFactor<WorldCoordinates extends Vector3Like>(worldPoint: WorldCoordinates): number {
        return Math.cosh(
            2 * Math.PI * (worldPoint.y / EarthConstants.EQUATORIAL_CIRCUMFERENCE - 0.5)
        );
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
        result.max.x = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        result.max.y = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        result.max.z = maxAltitude;
        return result;
    }

    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        let normalized: GeoCoordinates;

        if (geoPoint instanceof GeoCoordinates) {
            normalized = geoPoint.normalized();
        } else {
            normalized = new GeoCoordinates(
                geoPoint.latitude,
                geoPoint.longitude,
                geoPoint.altitude
            ).normalized();
        }

        if (!result) {
            // tslint:disable-next-line:no-object-literal-type-assertion
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }
        result.x = ((normalized.longitude + 180) / 360) * EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        result.y =
            (MercatorProjection.latitudeClampProject(normalized.latitudeInRadians) * 0.5 + 0.5) *
            EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const geoPoint = GeoCoordinates.fromRadians(
            MercatorProjection.unprojectLatitude(
                (worldPoint.y / EarthConstants.EQUATORIAL_CIRCUMFERENCE - 0.5) * 2.0
            ),
            (worldPoint.x / EarthConstants.EQUATORIAL_CIRCUMFERENCE) * 2 * Math.PI - Math.PI,
            worldPoint.z
        );
        return geoPoint;
    }

    projectBox<WorldBoundingBox extends Box3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        const center = geoBox.center;
        const worldCenter = this.projectPoint(
            new GeoCoordinates(center.latitude, center.longitude, 0)
        );
        const worldNorth =
            (MercatorProjection.latitudeClampProject(geoBox.northEast.latitudeInRadians) * 0.5 +
                0.5) *
            EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const worldSouth =
            (MercatorProjection.latitudeClampProject(geoBox.southWest.latitudeInRadians) * 0.5 +
                0.5) *
            EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const worldYCenter = (worldNorth + worldSouth) * 0.5;

        worldCenter.y = worldYCenter;

        const latitudeSpan = worldNorth - worldSouth;
        const longitudeSpan =
            (geoBox.longitudeSpan / 360) * EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        if (!result) {
            result = MathUtils.newEmptyBox3() as WorldBoundingBox;
        }
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
        return result;
    }

    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        const geoBox = GeoBox.fromCoordinates(minGeo, maxGeo);
        return geoBox;
    }
}

/**
 * Mercator [[Projection]] used to convert geo coordinates to world coordinates and vice versa.
 */
export const mercatorProjection: Projection = new MercatorProjection();
