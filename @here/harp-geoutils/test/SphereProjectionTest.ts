/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { Vector3 } from "three";

import { GeoBox } from "../lib/coordinates/GeoBox";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../lib/coordinates/GeoCoordinatesLike";
import { OrientedBox3 } from "../lib/math/OrientedBox3";
import { Vector3Like } from "../lib/math/Vector3Like";
import { EarthConstants } from "../lib/projection/EarthConstants";
import { sphereProjection } from "../lib/projection/SphereProjection";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

const epsilon = 0.000001;

describe("SphereProjection", function () {
    const samples: Array<[GeoCoordinatesLike, Vector3Like]> = [
        [new GeoCoordinates(0, 0, 0), { x: EarthConstants.EQUATORIAL_RADIUS, y: 0, z: 0 }],

        [new GeoCoordinates(0, 90, 0), { x: 0, y: EarthConstants.EQUATORIAL_RADIUS, z: 0 }],

        [new GeoCoordinates(90, 0, 0), { x: 0, y: 0, z: EarthConstants.EQUATORIAL_RADIUS }]
    ];

    it("ProjectUnprojectPoint", function () {
        const geoPoint = new GeoCoordinates(37.8178183439856, -122.4410209359072, 12.0);
        const worldPoint = sphereProjection.projectPoint(geoPoint);
        const geoPoint2 = sphereProjection.unprojectPoint(worldPoint);
        assert.approximately(geoPoint.latitude, geoPoint2.latitude, epsilon);
        assert.approximately(geoPoint.longitude, geoPoint2.longitude, epsilon);
        assert.approximately(geoPoint.altitude!, geoPoint2.altitude!, epsilon);
    });

    it("GroundDistance", function () {
        const geoPoint = new GeoCoordinates(37.8178183439856, -122.4410209359072, 12.0);
        const worldPoint = sphereProjection.projectPoint(geoPoint);
        assert.approximately(sphereProjection.groundDistance(worldPoint), 12.0, epsilon);
    });

    it("ScalePointToSurface", function () {
        const geoPoint = new GeoCoordinates(37.8178183439856, -122.4410209359072, 12.0);
        const worldPoint = sphereProjection.projectPoint(geoPoint);
        sphereProjection.scalePointToSurface(worldPoint);
        assert.approximately(sphereProjection.groundDistance(worldPoint), 0, epsilon);
    });

    it("LocalTangentSpace", function () {
        const transform = {
            xAxis: { x: 0, y: 0, z: 0 },
            yAxis: { x: 0, y: 0, z: 0 },
            zAxis: { x: 0, y: 0, z: 0 },
            position: { x: 0, y: 0, z: 0 }
        };

        const obb = new OrientedBox3();

        const geoPoint = new GeoCoordinates(40.702, -74.01154);
        const tileKey = webMercatorTilingScheme.getTileKey(geoPoint, 6)!;
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);

        // get the oriented bounding box enclosing `geoBox`.
        sphereProjection.projectBox(geoBox, obb);

        // get the local tangent space at `geoBox.center`.
        sphereProjection.localTangentSpace(geoBox.center, transform);

        // check the orientation of the axes but avoid comparing the `positions`.
        // In general `obb.position` should be different than `transform.position`.
        // `obb.position` should be a world point in the middle of the oriented
        // bounding box; `transform.center` should be on the surface.

        assert.approximately(transform.xAxis.x, obb.xAxis.x, epsilon);
        assert.approximately(transform.xAxis.y, obb.xAxis.y, epsilon);
        assert.approximately(transform.xAxis.z, obb.xAxis.z, epsilon);

        assert.approximately(transform.yAxis.x, obb.yAxis.x, epsilon);
        assert.approximately(transform.yAxis.y, obb.yAxis.y, epsilon);
        assert.approximately(transform.yAxis.z, obb.yAxis.z, epsilon);

        assert.approximately(transform.zAxis.x, obb.zAxis.x, epsilon);
        assert.approximately(transform.zAxis.y, obb.zAxis.y, epsilon);
        assert.approximately(transform.zAxis.z, obb.zAxis.z, epsilon);
    });

    it("LocalTangentSpaceAtWorld", function () {
        const transform = {
            xAxis: { x: 0, y: 0, z: 0 },
            yAxis: { x: 0, y: 0, z: 0 },
            zAxis: { x: 0, y: 0, z: 0 },
            position: { x: 0, y: 0, z: 0 }
        };

        const obb = new OrientedBox3();

        const geoPoint = new GeoCoordinates(40.702, -74.01154);

        const tileKey = webMercatorTilingScheme.getTileKey(geoPoint, 6)!;
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);

        // get the oriented bounding box enclosing `geoBox`.
        sphereProjection.projectBox(geoBox, obb);

        const worldPoint = sphereProjection.projectPoint(geoBox.center);
        sphereProjection.localTangentSpace(worldPoint, transform);
        assert.deepEqual(transform.position, worldPoint);

        // check the orientation of the axes but avoid comparing the `positions`.
        // In general `obb.position` should be different than `transform.position`.
        // `obb.position` should be a world point in the middle of the oriented
        // bounding box; `transform.center` should be on the surface.

        assert.approximately(transform.xAxis.x, obb.xAxis.x, epsilon);
        assert.approximately(transform.xAxis.y, obb.xAxis.y, epsilon);
        assert.approximately(transform.xAxis.z, obb.xAxis.z, epsilon);

        assert.approximately(transform.yAxis.x, obb.yAxis.x, epsilon);
        assert.approximately(transform.yAxis.y, obb.yAxis.y, epsilon);
        assert.approximately(transform.yAxis.z, obb.yAxis.z, epsilon);

        assert.approximately(transform.zAxis.x, obb.zAxis.x, epsilon);
        assert.approximately(transform.zAxis.y, obb.zAxis.y, epsilon);
        assert.approximately(transform.zAxis.z, obb.zAxis.z, epsilon);
    });

    samples.forEach(([geoPoint, expectedWorldPoint]) => {
        it(`ProjectPoint (${geoPoint.latitude}, ${geoPoint.longitude}, ${geoPoint.altitude})`, function () {
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

    (function () {
        const worldBox = new OrientedBox3();

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
            it(`ProjectBox contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${geoPoint.altitude}`, function () {
                const p = new Vector3();
                sphereProjection.projectPoint(geoPoint, p);
                assert.isTrue(worldBox.contains(p));
            });
        });

        outsidePoints.forEach(geoPoint => {
            it(`ProjectBox !contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${geoPoint.altitude}`, function () {
                const p = new Vector3();
                sphereProjection.projectPoint(geoPoint, p);
                assert.isFalse(worldBox.contains(p));
            });
        });
    })();

    (function () {
        const worldBox = new OrientedBox3();

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
            it(`ProjectBigBox contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${geoPoint.altitude}`, function () {
                const p = new Vector3();
                sphereProjection.projectPoint(geoPoint, p);
                assert.isTrue(worldBox.contains(p));
            });
        });

        outsidePoints.forEach(geoPoint => {
            it(`ProjectBigBox !contains ${geoPoint.latitude}, ${geoPoint.longitude}, ${geoPoint.altitude}`, function () {
                const p = new Vector3();
                sphereProjection.projectPoint(geoPoint, p);
                assert.isFalse(worldBox.contains(p));
            });
        });
    })();
});
