/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { GeoBox } from "../lib/coordinates/GeoBox";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { Box3Like } from "../lib/math/Box3Like";
import { Vector3Like } from "../lib/math/Vector3Like";
import { identityProjection } from "../lib/projection/IdentityProjection";
import { mercatorProjection, webMercatorProjection } from "../lib/projection/MercatorProjection";
import { Projection } from "../lib/projection/Projection";
import { sphereProjection } from "../lib/projection/SphereProjection";
import { mercatorTilingScheme } from "../lib/tiling/MercatorTilingScheme";
import { TileKey } from "../lib/tiling/TileKey";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

const EPSILON = 1e-6;

function containsPoint(box: Box3Like, point: Vector3Like): boolean {
    if (point.x < box.min.x || point.x > box.max.x) {
        return false;
    }

    if (point.y < box.min.y || point.y > box.max.y) {
        return false;
    }

    if (point.z < box.min.z || point.z > box.max.z) {
        return false;
    }

    return true;
}

describe("WebMercator", function() {
    it("project", function() {
        const coords = new GeoCoordinates(52.504951, 13.371806);
        const projected = webMercatorProjection.projectPoint(coords);
        const unprojected = webMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("project outside normal range", function() {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = webMercatorProjection.projectPoint(coords);
        const unprojected = webMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("projectBox", function() {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const box = webMercatorTilingScheme.getGeoBox(tileKey);
        const projectedBox = webMercatorProjection.projectBox(box);
        const unprojectedBox = webMercatorProjection.unprojectBox(projectedBox);

        assert.approximately(
            box.southWest.latitudeInRadians,
            unprojectedBox.southWest.latitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.southWest.longitudeInRadians,
            unprojectedBox.southWest.longitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.northEast.latitudeInRadians,
            unprojectedBox.northEast.latitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.northEast.longitudeInRadians,
            unprojectedBox.northEast.longitudeInRadians,
            0.0001
        );
    });
});

describe("Mercator", function() {
    it("project", function() {
        const coords = new GeoCoordinates(52.504951, 13.371806);
        const projected = mercatorProjection.projectPoint(coords);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    (function() {
        const geoPoints: GeoCoordinates[] = [
            new GeoCoordinates(52.504951, 13.371806, 12),
            new GeoCoordinates(52.504951, 13.371806, -12),
            new GeoCoordinates(52.504951, 13.371806, 0),
            new GeoCoordinates(52.504951, 13.371806),

            new GeoCoordinates(46.64943616335024, 2.4169921875, 43213),
            new GeoCoordinates(43.54854811091288, 12.12890625, 43233),
            new GeoCoordinates(47.60616304386873, 14.1064453125, 43213),
            new GeoCoordinates(50.65294336725707, 4.658203125, 132),
            new GeoCoordinates(47.1598400130443, 9.5361328125, 64),
            new GeoCoordinates(43.73935207915471, 7.3828125, 5423),
            new GeoCoordinates(43.96119063892024, 12.4365234375, -3234),
            new GeoCoordinates(63.07486569058662, 26.3232421875, 100),
            new GeoCoordinates(64.39693778132846, 17.7099609375, 548954),
            new GeoCoordinates(55.67758441108951, 10.01953125, 2),
            new GeoCoordinates(47.189712464484195, 19.3798828125, 0),
            new GeoCoordinates(7.536764322084082, 134.560546875),
            new GeoCoordinates(15.199386048559994, 145.72265625, 5485),
            new GeoCoordinates(33.943359946578816, 35.859375, 33),
            new GeoCoordinates(32.58384932565661, 54.2724609375, 43.23343),
            new GeoCoordinates(-34.95799531086792, 150.556640625, 2223.444),
            new GeoCoordinates(-13.79540620313281, -55.107421875, 10.2)
        ];

        const projections: Array<[string, Projection]> = [
            ["sphere", sphereProjection],
            ["mercator", mercatorProjection],
            ["webMercator", webMercatorProjection]
        ];

        projections.forEach(([targetProjectionName, targetProjection]) => {
            projections.forEach(([sourceProjectionName, sourceProjection]) => {
                geoPoints.forEach(geoPos => {
                    // tslint:disable-next-line: max-line-length
                    const altitudeDescr =
                        geoPos.altitude !== undefined ? `, ${geoPos.altitude}` : "";

                    const pointDescr = `(${geoPos.latitude}, ${geoPos.longitude}${altitudeDescr})`;

                    // tslint:disable-next-line: max-line-length
                    const descr = `reproject ${pointDescr} from ${sourceProjectionName} to ${targetProjectionName}`;

                    it(descr, function() {
                        // geo coordinates projected to sphere.
                        const projectedPoint = targetProjection.projectPoint(geoPos);

                        // geo coordinates projected to mercator.
                        const mercatorPoint = sourceProjection.projectPoint(geoPos);

                        // a position in mercator space reprojected using sphereProjection.
                        const reprojectedPoint = targetProjection.reprojectPoint(
                            sourceProjection,
                            mercatorPoint
                        );

                        assert.approximately(projectedPoint.x, reprojectedPoint.x, EPSILON);
                        assert.approximately(projectedPoint.y, reprojectedPoint.y, EPSILON);
                        assert.approximately(projectedPoint.z, reprojectedPoint.z, EPSILON);
                    });
                });
            });
        });
    })();

    it("project outside normal range", function() {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = mercatorProjection.projectPoint(coords);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("project not normalized", function() {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = mercatorProjection.projectPoint(coords, undefined);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("projectBox", function() {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const box = mercatorTilingScheme.getGeoBox(tileKey);
        const projectedBox = mercatorProjection.projectBox(box);
        const unprojectedBox = mercatorProjection.unprojectBox(projectedBox);

        assert.approximately(
            box.southWest.latitudeInRadians,
            unprojectedBox.southWest.latitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.southWest.longitudeInRadians,
            unprojectedBox.southWest.longitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.northEast.latitudeInRadians,
            unprojectedBox.northEast.latitudeInRadians,
            0.0001
        );
        assert.approximately(
            box.northEast.longitudeInRadians,
            unprojectedBox.northEast.longitudeInRadians,
            0.0001
        );
    });
});

describe("IdentityProjection", function() {
    it("projectBox3", function() {
        const southEastLow = new GeoCoordinates(-10, -10, -1);
        const northWestHigh = new GeoCoordinates(10, 10, 1);
        const geoBox = new GeoBox(southEastLow, northWestHigh);
        const worldBox = identityProjection.projectBox(geoBox);

        const worldPos = { x: 0, y: 0, z: 0 };

        identityProjection.projectPoint(new GeoCoordinates(0, 0, 0), worldPos);
        assert.isTrue(containsPoint(worldBox, worldPos));

        identityProjection.projectPoint(new GeoCoordinates(-11, 0, 0), worldPos);
        assert.isFalse(containsPoint(worldBox, worldPos));

        identityProjection.projectPoint(new GeoCoordinates(-9, 0, 0), worldPos);
        assert.isTrue(containsPoint(worldBox, worldPos));
    });
});
