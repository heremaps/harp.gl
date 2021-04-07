/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert, expect } from "chai";

import { GeoBox } from "../lib/coordinates/GeoBox";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { MathUtils } from "../lib/math/MathUtils";

const GEOCOORDS_EPSILON = 0.000001;

describe("GeoBox", function () {
    it("support antimeridian crossing geobox #1", function () {
        const g = GeoBox.fromCoordinates(
            new GeoCoordinates(-10, 170),
            new GeoCoordinates(10, -160)
        );

        assert.equal(g.west, 170);
        assert.equal(g.east, 200);
        assert.equal(g.north, 10);
        assert.equal(g.south, -10);

        assert.approximately(g.center.longitude, 185, GEOCOORDS_EPSILON);
        assert.approximately(g.center.latitude, 0, GEOCOORDS_EPSILON);

        assert.approximately(g.longitudeSpan, 30, GEOCOORDS_EPSILON);
        assert.approximately(g.latitudeSpan, 20, GEOCOORDS_EPSILON);
    });

    it("support antimeridian crossing geobox #2", function () {
        const auckland = new GeoCoordinates(-36.8, 174.7);
        const sanfrancisco = new GeoCoordinates(37.7, -122.6);

        const g = GeoBox.fromCoordinates(auckland, sanfrancisco);

        assert.equal(g.west, auckland.longitude);
        assert.equal(g.east, 57.4 + 180, "longitude is wrapped around antimeridian");
        assert.equal(g.north, sanfrancisco.latitude);
        assert.equal(g.south, auckland.latitude);

        assert.approximately(
            g.longitudeSpan,
            Math.abs(MathUtils.angleDistanceDeg(auckland.longitude, sanfrancisco.longitude)),
            GEOCOORDS_EPSILON
        );
        assert.approximately(
            g.latitudeSpan,
            Math.abs(MathUtils.angleDistanceDeg(auckland.latitude, sanfrancisco.latitude)),
            GEOCOORDS_EPSILON
        );
        assert.approximately(
            g.center.longitude,
            MathUtils.interpolateAnglesDeg(auckland.longitude, sanfrancisco.longitude, 0.5),
            GEOCOORDS_EPSILON
        );
        assert.approximately(
            g.center.latitude,
            MathUtils.interpolateAnglesDeg(auckland.latitude, sanfrancisco.latitude, 0.5),
            GEOCOORDS_EPSILON
        );
    });

    it("clone is not affected by changes in original", function () {
        const original = new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(1, 1));
        const clone = original.clone();
        expect(clone.southWest).not.equals(original.southWest);
        expect(clone.northEast).not.equals(original.northEast);
    });

    it("contains works for non normalized coordinates", function () {
        const g = GeoBox.fromCoordinates(
            new GeoCoordinates(-10, 170),
            new GeoCoordinates(10, -160)
        );

        assert.equal(g.west, 170);
        assert.equal(g.east, 200);
        assert.equal(g.north, 10);
        assert.equal(g.south, -10);

        assert.isTrue(g.contains(new GeoCoordinates(0, 180)));
        assert.isTrue(g.contains(new GeoCoordinates(0, 190)));
        assert.isTrue(g.contains(new GeoCoordinates(0, -170)));
        assert.isTrue(g.contains(new GeoCoordinates(0, -530)));
        assert.isTrue(g.contains(new GeoCoordinates(0, 540)));

        assert.isFalse(g.contains(new GeoCoordinates(0, -159)));
        assert.isFalse(g.contains(new GeoCoordinates(0, 201)));
        assert.isFalse(g.contains(new GeoCoordinates(0, 561)));
        assert.isFalse(g.contains(new GeoCoordinates(0, -510)));
    });

    describe("GeoBox.center", function () {
        it("center of zero-sized GeoBox", function () {
            const lat = 52.0;
            const lng = 0;

            const geoBox = new GeoBox(new GeoCoordinates(lat, lng), new GeoCoordinates(lat, lng));

            assert.strictEqual(geoBox.center.latitude, lat);
            assert.strictEqual(geoBox.center.longitude, lng);

            assert.strictEqual(geoBox.latitudeSpan, 0);
            assert.strictEqual(geoBox.longitudeSpan, 0);
        });

        it("center of zero-sized GeoBox created using center and extents", function () {
            const lat = 52.0;
            const lng = 0;

            const geoBox = GeoBox.fromCenterAndExtents(new GeoCoordinates(lat, lng), {
                latitudeSpan: 0,
                longitudeSpan: 0
            });

            assert.strictEqual(geoBox.center.latitude, lat);
            assert.strictEqual(geoBox.center.longitude, lng);

            assert.strictEqual(geoBox.latitudeSpan, 0);
            assert.strictEqual(geoBox.longitudeSpan, 0);
        });
    });
});
