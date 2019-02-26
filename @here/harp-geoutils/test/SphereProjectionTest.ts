/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { GeoBox } from "../lib/coordinates/GeoBox";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../lib/coordinates/GeoCoordinatesLike";
import { OrientedBox3Like } from "../lib/math/OrientedBox3Like";
import { Vector3Like } from "../lib/math/Vector3Like";
import { EarthConstants } from "../lib/projection/EarthConstants";
import { sphereProjection } from "../lib/projection/SphereProjection";

const epsilon = 0.000001;

function contains(obb: OrientedBox3Like, point: Vector3Like) {
    const dx = point.x - obb.position.x;
    const dy = point.y - obb.position.y;
    const dz = point.z - obb.position.z;
    const x = Math.abs(dx * obb.xAxis.x + dy * obb.xAxis.y + dz * obb.xAxis.z);
    const y = Math.abs(dx * obb.yAxis.x + dy * obb.yAxis.y + dz * obb.yAxis.z);
    const z = Math.abs(dx * obb.zAxis.x + dy * obb.zAxis.y + dz * obb.zAxis.z);
    if (x > obb.extents.x || y > obb.extents.y || z > obb.extents.z) {
        return false;
    }
    return true;
}

describe("SphereProjection", function() {
    const samples: Array<[GeoCoordinatesLike, Vector3Like]> = [
        [new GeoCoordinates(0, 0, 0), { x: EarthConstants.EQUATORIAL_RADIUS, y: 0, z: 0 }],

        [new GeoCoordinates(0, 90, 0), { x: 0, y: EarthConstants.EQUATORIAL_RADIUS, z: 0 }],

        [new GeoCoordinates(90, 0, 0), { x: 0, y: 0, z: EarthConstants.EQUATORIAL_RADIUS }]
    ];

    it("ProjectUnprojectPoint", function() {
        const geoPoint = new GeoCoordinates(37.8178183439856, -122.4410209359072, 12.0);
        const worldPoint = sphereProjection.projectPoint(geoPoint);
        const geoPoint2 = sphereProjection.unprojectPoint(worldPoint);
        assert.approximately(geoPoint.latitude, geoPoint2.latitude, epsilon);
        assert.approximately(geoPoint.longitude, geoPoint2.longitude, epsilon);
        assert.approximately(geoPoint.altitude!, geoPoint2.altitude!, epsilon);
    });

    samples.forEach(([geoPoint, expectedWorldPoint]) => {
        it(`ProjectPoint (${geoPoint.latitude}, ${geoPoint.longitude}, ${
            geoPoint.altitude
        })`, function() {
            const worldPoint = sphereProjection.projectPoint(geoPoint);

            assert.approximately(expectedWorldPoint.x, worldPoint.x, epsilon);
            assert.approximately(expectedWorldPoint.y, worldPoint.y, epsilon);
            assert.approximately(expectedWorldPoint.z, worldPoint.z, epsilon);

            const geoPoint2 = sphereProjection.unprojectPoint(worldPoint);

            assert.approximately(geoPoint.latitude, geoPoint2.latitude, epsilon);
            assert.approximately(geoPoint.longitude, geoPoint2.longitude, epsilon);
            assert.approximately(geoPoint.altitude!, geoPoint2.altitude!, epsilon);
        });
    });

    (function() {
        const position = { x: 0, y: 0, z: 0 };
        const xAxis = { x: 1, y: 0, z: 0 };
        const yAxis = { x: 0, y: 1, z: 0 };
        const zAxis = { x: 0, y: 0, z: 1 };
        const extents = { x: 0, y: 0, z: 0 };
        const worldBox = { position, xAxis, yAxis, zAxis, extents };

        const southEastLow = new GeoCoordinates(-10, -10, -10);

        const northWestHigh = new GeoCoordinates(10, 10, 10);

        const geoBox = new GeoBox(southEastLow, northWestHigh);

        sphereProjection.projectBox(geoBox, worldBox);

        const insidePoints = [
            new GeoCoordinates(0, 0, 0),
            new GeoCoordinates(0, 0, 9),
            new GeoCoordinates(0, 0, -9),
            new GeoCoordinates(9, 0, 0),
            new GeoCoordinates(-9, 0, 0),
            new GeoCoordinates(0, 9, 0),
            new GeoCoordinates(0, -9, 0)
        ];

        const outsidePoints = [
            new GeoCoordinates(0, 0, 12),
            new GeoCoordinates(12, 0, 0),
            new GeoCoordinates(-12, 0, 0),
            new GeoCoordinates(0, 12, 0),
            new GeoCoordinates(0, -12, 0)
        ];

        insidePoints.forEach(geoPoint => {
            // tslint:disable-next-line: max-line-length
            it(`ProjectBox contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${
                geoPoint.altitude
            }`, function() {
                const p = sphereProjection.projectPoint(geoPoint);
                assert.isTrue(contains(worldBox, p));
            });
        });

        outsidePoints.forEach(geoPoint => {
            // tslint:disable-next-line: max-line-length
            it(`ProjectBox !contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${
                geoPoint.altitude
            }`, function() {
                const p = sphereProjection.projectPoint(geoPoint);
                assert.isFalse(contains(worldBox, p));
            });
        });
    })();

    (function() {
        const position = { x: 0, y: 0, z: 0 };
        const xAxis = { x: 1, y: 0, z: 0 };
        const yAxis = { x: 0, y: 1, z: 0 };
        const zAxis = { x: 0, y: 0, z: 1 };
        const extents = { x: 0, y: 0, z: 0 };
        const worldBox = { position, xAxis, yAxis, zAxis, extents };

        const southEastLow = new GeoCoordinates(40, -170, -10);

        const northWestHigh = new GeoCoordinates(50, 170, 10);

        const geoBox = new GeoBox(southEastLow, northWestHigh);

        sphereProjection.projectBox(geoBox, worldBox);

        const insidePoints = [
            new GeoCoordinates(45, 0, 0),
            new GeoCoordinates(49.9999, 0, 10),
            new GeoCoordinates(40.0001, 0, 10)
        ];

        const outsidePoints = [new GeoCoordinates(60, 0, 0)];

        insidePoints.forEach(geoPoint => {
            // tslint:disable-next-line: max-line-length
            it(`ProjectBigBox contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${
                geoPoint.altitude
            }`, function() {
                const p = sphereProjection.projectPoint(geoPoint);
                assert.isTrue(contains(worldBox, p));
            });
        });

        outsidePoints.forEach(geoPoint => {
            // tslint:disable-next-line: max-line-length
            it(`ProjectBigBox !contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${
                geoPoint.altitude
            }`, function() {
                const p = sphereProjection.projectPoint(geoPoint);
                assert.isFalse(contains(worldBox, p));
            });
        });
    })();
});
