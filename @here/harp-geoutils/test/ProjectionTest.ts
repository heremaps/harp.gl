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
import { mercatorProjection } from "../lib/projection/MercatorProjection";
import { webMercatorProjection } from "../lib/projection/WebMercatorProjection";
import { mercatorTilingScheme } from "../lib/tiling/MercatorTilingScheme";
import { TileKey } from "../lib/tiling/TileKey";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

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

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, 0.0001);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, 0.0001);
    });

    it("project outside normal range", function() {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = webMercatorProjection.projectPoint(coords);
        const unprojected = webMercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, 0.0001);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, 0.0001);
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

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, 0.0001);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, 0.0001);
    });

    it("project outside normal range", function() {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = mercatorProjection.projectPoint(coords);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, 0.0001);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, 0.0001);
    });

    it("project not normalized", function() {
        const coords = new GeoCoordinates(52.504951, 373.371806);
        const projected = mercatorProjection.projectPoint(coords, undefined);
        const unprojected = mercatorProjection.unprojectPoint(projected);

        assert.approximately(coords.latitudeInRadians, unprojected.latitudeInRadians, 0.0001);
        assert.approximately(coords.longitudeInRadians, unprojected.longitudeInRadians, 0.0001);
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
