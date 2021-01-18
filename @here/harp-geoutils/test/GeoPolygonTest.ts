/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { assert } from "chai";

import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { GeoPolygon, GeoPolygonCoordinates } from "../lib/coordinates/GeoPolygon";

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

const GEOCOORDS_EPSILON = 0.000001;

describe("GeoPolygon", function () {
    it("creates GeoPolygon from an Array of GeoCoordinates", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(-10, 170),
            new GeoCoordinates(-10, -160),
            new GeoCoordinates(10, -160),
            new GeoCoordinates(10, 170)
        ]);

        assert.isDefined(geoPolygon);
        assert.isNotEmpty(geoPolygon.coordinates);
        assert.equal(geoPolygon.coordinates.length, 4);
    });

    it("creates GeoPolygon from an Array of GeoCoordinates Like", function () {
        const geoPolygon = new GeoPolygon([
            { latitude: -10, longitude: 170 },
            { latitude: -10, longitude: -160 },
            { latitude: 10, longitude: -160 },
            { latitude: 10, longitude: 170 }
        ]);

        assert.isDefined(geoPolygon);
        assert.isNotEmpty(geoPolygon.coordinates);
        assert.equal(geoPolygon.coordinates.length, 4);
    });

    it("creates GeoPolygon from an mixed Array ", function () {
        const geoPolygon = new GeoPolygon([
            { latitude: -10, longitude: 170 },
            new GeoCoordinates(-10, -160),
            [10, -160],
            { lat: 10, lng: 170 }
        ]);

        assert.isDefined(geoPolygon);
        assert.isNotEmpty(geoPolygon.coordinates);
        assert.equal(geoPolygon.coordinates.length, 4);
    });

    it("sorts concave coordinates ccw", function () {
        const coord0 = new GeoCoordinates(-10, 170);
        const coord1 = new GeoCoordinates(10, -160);
        const coord2 = new GeoCoordinates(-10, -160);
        const coord3 = new GeoCoordinates(10, 170);

        const geoPolygon = new GeoPolygon([coord0, coord1, coord2, coord3], true);

        assert.isDefined(geoPolygon);
        assert.isNotEmpty(geoPolygon.coordinates);
        assert.deepEqual(geoPolygon.coordinates[0], coord1);
        assert.deepEqual(geoPolygon.coordinates[1], coord2);
        assert.deepEqual(geoPolygon.coordinates[2], coord0);
        assert.deepEqual(geoPolygon.coordinates[3], coord3);
    });

    it("creates valid BoundingBox and Centroid", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(2, 160),
            new GeoCoordinates(2, 170),
            new GeoCoordinates(10, 170),
            new GeoCoordinates(10, 160)
        ]);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, 160);
        assert.equal(geoBBox.east, 170);
        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, 2);

        assert.approximately(geoBBox?.center.longitude, 165, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 6, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 10, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 8, GEOCOORDS_EPSILON);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }
        assert.deepEqual(centroid, new GeoCoordinates(6, 165));
        assert.isTrue(geoBBox.contains(centroid));
    });

    it("creates Invalid BoundingBox and NO Centroid for twisted sorted coordinates", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(2, 160),
            new GeoCoordinates(10, 170),
            new GeoCoordinates(2, 170),
            new GeoCoordinates(10, 160)
        ]);

        const centroid = geoPolygon.getCentroid();
        assert.isUndefined(centroid);

        const geoBBox = geoPolygon.getGeoBoundingBox();
        assert.equal(geoBBox.latitudeSpan, 0);
        assert.equal(geoBBox.longitudeSpan, 0);
    });

    it("creates BoundingBox and Centroid for simple convex polygon", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(2, 160),
            new GeoCoordinates(5, 165),
            new GeoCoordinates(2, 170),
            new GeoCoordinates(10, 170),
            new GeoCoordinates(10, 160)
        ]);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, 160);
        assert.equal(geoBBox.east, 170);
        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, 2);

        assert.approximately(geoBBox?.center.longitude, 165, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 6, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 10, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 8, GEOCOORDS_EPSILON);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }
        assert.closeTo(centroid.latitude, 7, 1);
        assert.closeTo(centroid.longitude, 165, 1);
        assert.isTrue(geoBBox.contains(centroid));
    });

    it("creates BoundingBox and Centroid for parallel lined convex polygon", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(2, 160),
            new GeoCoordinates(2, 167),
            new GeoCoordinates(9, 162),
            new GeoCoordinates(9, 169),
            new GeoCoordinates(2, 169),
            new GeoCoordinates(2, 170),
            new GeoCoordinates(10, 170),
            new GeoCoordinates(10, 160)
        ]);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, 160);
        assert.equal(geoBBox.east, 170);
        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, 2);

        assert.approximately(geoBBox?.center.longitude, 165, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 6, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 10, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 8, GEOCOORDS_EPSILON);

        const centroid = geoPolygon.getCentroid();
        assert.isDefined(centroid);

        if (centroid === undefined) {
            return;
        }
        assert.closeTo(centroid.latitude, 6, 1);
        assert.closeTo(centroid.longitude, 165, 1);
        assert.isTrue(geoBBox.contains(centroid));
    });

    it("creates valid BoundingBox and Centroid for non axis aligned  polygon", function () {
        const geoPolygon = new GeoPolygon(
            [
                { latitude: 37, longitude: 13, altitude: 0 },
                { latitude: 79, longitude: 37, altitude: 0 },
                { latitude: 64, longitude: 149, altitude: 0 },
                { latitude: 4, longitude: 97, altitude: 0 },
                { latitude: 13, longitude: 102, altitude: 0 }
            ],
            true
        );

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, 13);
        assert.equal(geoBBox.east, 149);
        assert.equal(geoBBox.north, 79);
        assert.equal(geoBBox.south, 4);
    });

    it("creates valid BoundingBox and Centroid for not axis aligned polygon", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(6, 40),
            new GeoCoordinates(10, 30),
            new GeoCoordinates(6, 20),
            new GeoCoordinates(2, 30)
        ]);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, 20);
        assert.equal(geoBBox.east, 40);
        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, 2);

        assert.approximately(geoBBox?.center.longitude, 30, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 6, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 20, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 8, GEOCOORDS_EPSILON);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }
        assert.deepEqual(centroid, new GeoCoordinates(6, 30));
        assert.isTrue(geoBBox.contains(centroid));
    });

    it("creates valid BoundingBox and Centroid for unnormalized coordinates", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(2, -340),
            new GeoCoordinates(2, 20),
            new GeoCoordinates(10, 20),
            new GeoCoordinates(10, -340)
        ]);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, -340);
        assert.equal(geoBBox.east, 20);
        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, 2);

        assert.approximately(geoBBox?.center.longitude, -160, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 6, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 360, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 8, GEOCOORDS_EPSILON);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }
        assert.deepEqual(centroid, new GeoCoordinates(6, -160));
        assert.isTrue(geoBBox.contains(centroid));
    });

    it("wraps coordinates around if requested", function () {
        const initialCoords: GeoPolygonCoordinates = [
            new GeoCoordinates(-10, 80),
            new GeoCoordinates(-10, -160),
            new GeoCoordinates(10, -160),
            new GeoCoordinates(10, 80)
        ];
        const geoPolygon = new GeoPolygon(initialCoords, false, true);

        const finalCoords = geoPolygon.coordinates;

        assert.sameDeepOrderedMembers(finalCoords, [
            finalCoords[0],
            {
                latitude: -10,
                longitude: 200,
                altitude: undefined
            },
            { latitude: 10, longitude: 200, altitude: undefined },
            finalCoords[3]
        ]);
    });

    it("wrapping supports multiple antimeridian crossings for concave polygons", function () {
        const initialCoords: GeoPolygonCoordinates = [
            new GeoCoordinates(-10, 150),
            new GeoCoordinates(-20, -170),
            new GeoCoordinates(-5, -170),
            new GeoCoordinates(0, 160),
            new GeoCoordinates(5, -170),
            new GeoCoordinates(20, -170),
            new GeoCoordinates(10, 150)
        ];
        const geoPolygon = new GeoPolygon(initialCoords, false, true);

        const finalCoords = geoPolygon.coordinates;

        assert.sameDeepOrderedMembers(finalCoords, [
            finalCoords[0],
            {
                latitude: finalCoords[1].latitude,
                longitude: 190,
                altitude: undefined
            },
            {
                latitude: finalCoords[2].latitude,
                longitude: 190,
                altitude: undefined
            },
            finalCoords[3],
            {
                latitude: finalCoords[4].latitude,
                longitude: 190,
                altitude: undefined
            },
            {
                latitude: finalCoords[5].latitude,
                longitude: 190,
                altitude: undefined
            },
            finalCoords[6]
        ]);
    });

    it("supports antimeridian crossing GeoPolygon", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(-10, 170),
            new GeoCoordinates(-10, -160),
            new GeoCoordinates(10, -160),
            new GeoCoordinates(10, 170)
        ]);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }

        assert.equal(centroid.latitude, 0);
        assert.equal(centroid.longitude, -175);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, -10);
        assert.equal(geoBBox.west, 170);
        assert.equal(geoBBox.east, 200);

        assert.approximately(geoBBox?.center.longitude, 185, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 0, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 30, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 20, GEOCOORDS_EPSILON);

        assert.isTrue(geoBBox.contains(centroid));
    });

    it("supports pole wrapping GeoPolygon", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(-90, 170),
            new GeoCoordinates(-90, -160),
            new GeoCoordinates(10, -160),
            new GeoCoordinates(10, 170)
        ]);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }

        assert.equal(centroid.latitude, -40);
        assert.equal(centroid.longitude, -175);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, -90);
        assert.equal(geoBBox.west, 170);
        assert.equal(geoBBox.east, 200);

        assert.approximately(geoBBox?.center.longitude, 185, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, -40, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 30, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 100, GEOCOORDS_EPSILON);

        assert.isTrue(geoBBox.contains(centroid));
    });

    it("might break sorting of convex polygons", function () {
        const coord0 = new GeoCoordinates(2, 160);
        const coord1 = new GeoCoordinates(2, 167);
        const coord2 = new GeoCoordinates(9, 162);
        const coord3 = new GeoCoordinates(9, 169);
        const coord4 = new GeoCoordinates(2, 169);
        const coord5 = new GeoCoordinates(2, 170);
        const coord6 = new GeoCoordinates(10, 170);
        const coord7 = new GeoCoordinates(10, 160);

        const geoPolygon = new GeoPolygon(
            [coord0, coord1, coord2, coord3, coord4, coord5, coord6, coord7],
            true
        );

        assert.notDeepEqual(geoPolygon.coordinates[0], coord0);
        assert.notDeepEqual(geoPolygon.coordinates[1], coord1);

        assert.isDefined(geoPolygon.getCentroid());
    });

    it("ignores altitudes", function () {
        const geoPolygon = new GeoPolygon([
            new GeoCoordinates(6, 40),
            new GeoCoordinates(10, 30, 50),
            new GeoCoordinates(6, 20, -10),
            new GeoCoordinates(2, 30)
        ]);

        const geoBBox = geoPolygon.getGeoBoundingBox();

        assert.equal(geoBBox.west, 20);
        assert.equal(geoBBox.east, 40);
        assert.equal(geoBBox.north, 10);
        assert.equal(geoBBox.south, 2);

        assert.approximately(geoBBox?.center.longitude, 30, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.center.latitude, 6, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.longitudeSpan, 20, GEOCOORDS_EPSILON);
        assert.approximately(geoBBox?.latitudeSpan, 8, GEOCOORDS_EPSILON);

        const centroid = geoPolygon.getCentroid();

        assert.isDefined(centroid);
        if (centroid === undefined) {
            return;
        }
        assert.deepEqual(centroid, new GeoCoordinates(6, 30));
        assert.isTrue(geoBBox.contains(centroid));
    });
});
