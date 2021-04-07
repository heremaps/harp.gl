/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import * as THREE from "three";

import { GeoBox } from "../lib/coordinates/GeoBox";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { Box3Like } from "../lib/math/Box3Like";
import { MathUtils } from "../lib/math/MathUtils";
import { OrientedBox3 } from "../lib/math/OrientedBox3";
import { Vector3Like } from "../lib/math/Vector3Like";
import { equirectangularProjection } from "../lib/projection/EquirectangularProjection";
import { identityProjection } from "../lib/projection/IdentityProjection";
import { mercatorProjection, webMercatorProjection } from "../lib/projection/MercatorProjection";
import { Projection } from "../lib/projection/Projection";
import { sphereProjection } from "../lib/projection/SphereProjection";
import { transverseMercatorProjection } from "../lib/projection/TransverseMercatorProjection";
import { hereTilingScheme } from "../lib/tiling/HereTilingScheme";
import { mercatorTilingScheme } from "../lib/tiling/MercatorTilingScheme";
import { polarTilingScheme } from "../lib/tiling/PolarTilingScheme";
import { TileKey } from "../lib/tiling/TileKey";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

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

describe("WebMercator", function () {
    it("project", function () {
        const coords = new GeoCoordinates(52.504951, 13.371806, 100);
        const projected = webMercatorProjection.projectPoint(coords);
        const unprojected = webMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
        assert.equal(coords.altitude, unprojected.altitude);
    });

    it("project outside normal range", function () {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = webMercatorProjection.projectPoint(coords);
        const unprojected = webMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("projectBox", function () {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const box = webMercatorTilingScheme.getGeoBox(tileKey);
        const projectedBox = webMercatorProjection.projectBox(box);
        const unprojectedBox = webMercatorProjection.unprojectBox(projectedBox);

        assert.approximately(
            box.southWest.latitudeInRadians,
            unprojectedBox.southWest.latitudeInRadians,
            EPSILON
        );
        assert.approximately(
            box.southWest.longitudeInRadians,
            unprojectedBox.southWest.longitudeInRadians,
            EPSILON
        );
        assert.approximately(
            box.northEast.latitudeInRadians,
            unprojectedBox.northEast.latitudeInRadians,
            EPSILON
        );
        assert.approximately(
            box.northEast.longitudeInRadians,
            unprojectedBox.northEast.longitudeInRadians,
            EPSILON
        );
    });

    it("(un)projectBoxFlipsY AABB", function () {
        // This test ensures that the project & unproject box function of the web mercator
        // projection correctly inverts the y axis.
        const geoCoord = new GeoCoordinates(53, 13);
        const tileKey = webMercatorTilingScheme.getTileKey(geoCoord, 10);
        assert.isNotNull(tileKey);
        const worldBox = webMercatorTilingScheme.getWorldBox(tileKey!);
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey!);
        const projWorldBox = webMercatorProjection.projectBox(geoBox);

        assert.approximately(worldBox.min.x, projWorldBox.min.x, EPSILON);
        assert.approximately(worldBox.min.y, projWorldBox.min.y, EPSILON);
        assert.approximately(worldBox.min.z, projWorldBox.min.z, EPSILON);
        assert.approximately(worldBox.max.x, projWorldBox.max.x, EPSILON);
        assert.approximately(worldBox.max.y, projWorldBox.max.y, EPSILON);
        assert.approximately(worldBox.max.z, projWorldBox.max.z, EPSILON);

        // Test that unprojecting the box gives the correct GeoBox
        const unprojWorldBox = webMercatorProjection.unprojectBox(projWorldBox);
        assert.approximately(
            geoBox.southWest.latitudeInRadians,
            unprojWorldBox.southWest.latitudeInRadians,
            EPSILON
        );
        assert.approximately(
            geoBox.southWest.longitudeInRadians,
            unprojWorldBox.southWest.longitudeInRadians,
            EPSILON
        );
        assert.approximately(
            geoBox.northEast.latitudeInRadians,
            unprojWorldBox.northEast.latitudeInRadians,
            EPSILON
        );
        assert.approximately(
            geoBox.northEast.longitudeInRadians,
            unprojWorldBox.northEast.longitudeInRadians,
            EPSILON
        );
    });

    it("projectBoxFlipsY OBB", function () {
        // This test ensures that the project box function of the web mercator
        // projection correctly inverts the y axis.
        const obb = new OrientedBox3();
        const geoCoord = new GeoCoordinates(53, 13);
        const tileKey = webMercatorTilingScheme.getTileKey(geoCoord, 10);
        assert.isNotNull(tileKey);
        const worldBox = webMercatorTilingScheme.getWorldBox(tileKey!);
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey!);

        webMercatorTilingScheme.projection.projectBox(geoBox, obb);

        const min = MathUtils.newVector3(0, 0, 0);
        const max = MathUtils.newVector3(0, 0, 0);

        min.x = obb.position.x - obb.extents.x;
        min.y = obb.position.y - obb.extents.y;
        min.z = obb.position.z - obb.extents.z;

        max.x = obb.position.x + obb.extents.x;
        max.y = obb.position.y + obb.extents.y;
        max.z = obb.position.z + obb.extents.z;

        assert.approximately(worldBox.min.x, min.x, EPSILON);
        assert.approximately(worldBox.min.y, min.y, EPSILON);
        assert.approximately(worldBox.max.x, max.x, EPSILON);
        assert.approximately(worldBox.max.y, max.y, EPSILON);
    });
});

describe("Equirectangular", function () {
    it("project", function () {
        const coords = new GeoCoordinates(52.504951, 13.371806);
        const projected = equirectangularProjection.projectPoint(coords);
        const unprojected = equirectangularProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("project outside normal range", function () {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = equirectangularProjection.projectPoint(coords);
        const unprojected = equirectangularProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("projectBox", function () {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const box = hereTilingScheme.getGeoBox(tileKey);
        const projectedBox = equirectangularProjection.projectBox(box);
        const unprojectedBox = equirectangularProjection.unprojectBox(projectedBox);

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

describe("Mercator", function () {
    it("project", function () {
        const coords = new GeoCoordinates(52.504951, 13.371806, 100);
        const projected = mercatorProjection.projectPoint(coords);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
        assert.equal(coords.altitude, unprojected.altitude);
    });
    it("project outside normal range", function () {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = mercatorProjection.projectPoint(coords);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("project not normalized", function () {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = mercatorProjection.projectPoint(coords, undefined);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("projectBox", function () {
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

describe("TransverseMercator", function () {
    it("project", function () {
        const coords = new GeoCoordinates(52.504951, 13.371806, 100);
        const projected = transverseMercatorProjection.projectPoint(coords);
        const unprojected = transverseMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
        assert.equal(coords.altitude, unprojected.altitude);
    });
    it("project outside normal range", function () {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = transverseMercatorProjection.projectPoint(coords);
        const unprojected = transverseMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("project not normalized", function () {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = transverseMercatorProjection.projectPoint(coords, undefined);
        const unprojected = transverseMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, EPSILON);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, EPSILON);
    });

    it("projectBox", function () {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const box = polarTilingScheme.getGeoBox(tileKey);
        const projectedBox = transverseMercatorProjection.projectBox(box);
        const unprojectedBox = transverseMercatorProjection.unprojectBox(projectedBox);

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

describe("Reprojection", function () {
    const ml = THREE.MathUtils.radToDeg(Math.atan(Math.sinh(Math.PI)));

    const geoPoints: GeoCoordinates[] = [
        new GeoCoordinates(52.504951, 13.371806, 12),
        new GeoCoordinates(52.504951, 13.371806, -12),
        new GeoCoordinates(52.504951, 13.371806, 0),
        new GeoCoordinates(52.504951, 13.371806),

        new GeoCoordinates(0, 0),
        new GeoCoordinates(0, +85),
        new GeoCoordinates(0, -85),
        new GeoCoordinates(0, +ml),
        new GeoCoordinates(0, -ml),
        new GeoCoordinates(+45, +ml),
        new GeoCoordinates(-45, -ml),
        new GeoCoordinates(+ml, 0),
        new GeoCoordinates(-ml, 0),
        new GeoCoordinates(+ml, +45),
        new GeoCoordinates(-ml, -45),
        new GeoCoordinates(0, +180),
        // TODO: this actually fails
        // new GeoCoordinates(  0, -180),
        new GeoCoordinates(0, +170),
        new GeoCoordinates(0, -170),
        new GeoCoordinates(+5, +170),
        new GeoCoordinates(-5, -170),
        new GeoCoordinates(+5, +90),
        new GeoCoordinates(-5, -90),

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
        ["webMercator", webMercatorProjection],
        ["transverseMercator", transverseMercatorProjection]
    ];

    projections.forEach(([targetProjectionName, targetProjection]) => {
        projections.forEach(([sourceProjectionName, sourceProjection]) => {
            geoPoints.forEach(geoPos => {
                const altitudeDescr = geoPos.altitude !== undefined ? `, ${geoPos.altitude}` : "";

                const pointDescr = `(${geoPos.latitude}, ${geoPos.longitude}${altitudeDescr})`;

                const descr = `reproject ${pointDescr} from ${sourceProjectionName} to ${targetProjectionName}`;

                it(descr, function () {
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
});

describe("IdentityProjection", function () {
    it("projectBox3", function () {
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
