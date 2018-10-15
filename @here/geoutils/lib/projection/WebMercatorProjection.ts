import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { MercatorProjection } from "./MercatorProjection";
import { Projection } from "./Projection";

class WebMercatorProjection extends MercatorProjection {
    static readonly MAXIMUM_LATITUDE: number = 1.4844222297453323;

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

        result.x = ((normalized.longitude + 180) / 360) * EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const sy = Math.sin(MercatorProjection.latitudeClamp(normalized.latitudeInRadians));
        result.y =
            (0.5 - Math.log((1 + sy) / (1 - sy)) / (4 * Math.PI)) *
            EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        result.z = geoPoint.altitude || 0;
        return result;
    }

    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const clampedX = MercatorProjection.clamp(
            worldPoint.x,
            0,
            EarthConstants.EQUATORIAL_CIRCUMFERENCE
        );
        const x = clampedX / EarthConstants.EQUATORIAL_CIRCUMFERENCE - 0.5;
        const clampedY = MercatorProjection.clamp(
            worldPoint.y,
            0,
            EarthConstants.EQUATORIAL_CIRCUMFERENCE
        );
        const y = 0.5 - clampedY / EarthConstants.EQUATORIAL_CIRCUMFERENCE;

        const longitude = 360 * x;
        const latitude = 90 - (360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI;

        return new GeoCoordinates(latitude, longitude, worldPoint.z);
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
}

/**
 * Web Mercator [[Projection]] used to convert geo coordinates to world coordinates and vice versa.
 */
export const webMercatorProjection: Projection = new WebMercatorProjection();
