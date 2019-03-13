/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { assert } from "chai";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { mercatorProjection } from "../lib/projection/MercatorProjection";
import { webMercatorProjection } from "../lib/projection/WebMercatorProjection";
import { mercatorTilingScheme } from "../lib/tiling/MercatorTilingScheme";
import { TileKey } from "../lib/tiling/TileKey";
import { webMercatorTilingScheme } from "../lib/tiling/WebMercatorTilingScheme";

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

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
