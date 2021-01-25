/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { GeoPointLike, isGeoPointLike } from "../lib/coordinates/GeoPointLike";

describe("GeoCoordinates", function () {
    const tests = [
        { args: [90, 180], expected: [90, 180] },
        { args: [-90, -180], expected: [-90, -180] },
        { args: [0, 0], expected: [0, 0] },
        { args: [90, 250], expected: [90, -110] },
        { args: [91, 123], expected: [90, 123] },
        { args: [360, 123], expected: [90, 123] },
        { args: [451, 123], expected: [90, 123] },
        { args: [-91, 123], expected: [-90, 123] },
        { args: [181, 123], expected: [90, 123] },
        { args: [359, 123], expected: [90, 123] },
        { args: [271, 123], expected: [90, 123] },
        { args: [-360, 123], expected: [-90, 123] },
        { args: [361, 123], expected: [90, 123] },
        { args: [-360, 123, 0], expected: [-90, 123, 0] },
        { args: [361, 123, 50], expected: [90, 123, 50] },
        { args: [361, -720, 50], expected: [90, 0, 50] },
        { args: [361, -711, 50], expected: [90, 9, 50] },
        { args: [361, -4534, 50], expected: [90, 146, 50] },
        { args: [361, 4534, 50], expected: [90, -146, 50] }
    ];

    it("API compatibility", function () {
        tests.forEach(sample => {
            const [latitude, longitude, altitude] = sample.args; // decomposed input

            const geoPoint = new GeoCoordinates(latitude, longitude, altitude);

            const geoPointLiteral: GeoPointLike = [longitude, latitude, altitude];

            assert.isTrue(isGeoPointLike(geoPointLiteral));

            const geoJsonCoords = GeoCoordinates.fromGeoPoint(geoPointLiteral);

            assert.strictEqual(geoPoint.latitude, geoJsonCoords.latitude);
            assert.strictEqual(geoPoint.longitude, geoJsonCoords.longitude);
            assert.strictEqual(geoPoint.altitude, geoJsonCoords.altitude);

            if (altitude === undefined) {
                assert.deepEqual(geoPoint.toGeoPoint(), [longitude, latitude]);
            } else {
                assert.deepEqual(geoPoint.toGeoPoint(), [longitude, latitude, altitude]);
            }

            const latLngLiteral = { lat: latitude, lng: longitude };

            const latLngCoords = GeoCoordinates.fromLatLng(latLngLiteral);

            assert.strictEqual(geoPoint.latitude, latLngCoords.latitude);
            assert.strictEqual(geoPoint.longitude, latLngCoords.longitude);
            assert.isUndefined(latLngCoords.altitude);

            assert.deepEqual(geoPoint.toLatLng(), { lat: latitude, lng: longitude });

            const { lat, lng } = geoPoint;
            assert.strictEqual(geoPoint.lat, lat);
            assert.strictEqual(geoPoint.lng, lng);
        });
    });

    tests.forEach(function (test) {
        it(
            "normalized GeoCoordinates { " +
                test.args[0] +
                ", " +
                test.args[1] +
                ", " +
                test.args[2] +
                " }",
            function () {
                const normalized = new GeoCoordinates(
                    test.args[0],
                    test.args[1],
                    test.args[2]
                ).normalized();
                assert.deepEqual(
                    {
                        latitude: test.expected[0],
                        longitude: test.expected[1],
                        altitude: test.expected[2]
                    },
                    {
                        latitude: normalized.latitude,
                        longitude: normalized.longitude,
                        altitude: normalized.altitude
                    }
                );
            }
        );
    });
    it("minLongitudeSpanTo returns minimum span between two geocoordinates", function () {
        assert.equal(
            GeoCoordinates.fromDegrees(0, -50).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, 100)
            ),
            150
        );
        assert.equal(
            GeoCoordinates.fromDegrees(0, 100).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, -50)
            ),
            150
        );

        assert.equal(
            GeoCoordinates.fromDegrees(0, -170).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, 160)
            ),
            30
        );
        assert.equal(
            GeoCoordinates.fromDegrees(0, 160).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, -170)
            ),
            30
        );

        assert.equal(
            GeoCoordinates.fromDegrees(0, -180).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, 180)
            ),
            0
        );
        assert.equal(
            GeoCoordinates.fromDegrees(0, 180).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, -180)
            ),
            0
        );

        assert.equal(
            GeoCoordinates.fromDegrees(0, -180).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, 0)
            ),
            180
        );
        assert.equal(
            GeoCoordinates.fromDegrees(0, 0).minLongitudeSpanTo(
                GeoCoordinates.fromDegrees(0, -180)
            ),
            180
        );
    });

    describe("lerp", function () {
        it("returns first coords if factor is 0", function () {
            const start = new GeoCoordinates(10, 50, 1000);
            const end = new GeoCoordinates(20, 5, 500);
            assert.deepEqual(GeoCoordinates.lerp(start, end, 0), start);
        });
        it("returns second coords if factor is 1", function () {
            const start = new GeoCoordinates(10, 50, 1000);
            const end = new GeoCoordinates(20, 5, 500);
            assert.deepEqual(GeoCoordinates.lerp(start, end, 1), end);
        });
        it("interpolates given coords if factor >0 and <1", function () {
            const start = new GeoCoordinates(10, 50, 1000);
            const end = new GeoCoordinates(20, 10, 500);
            assert.deepEqual(
                GeoCoordinates.lerp(start, end, 0.25),
                new GeoCoordinates(12.5, 40, 875)
            );
        });
        it("normalizes result if requested", function () {
            const start = new GeoCoordinates(10, 180);
            const end = new GeoCoordinates(20, 190);
            assert.deepEqual(
                GeoCoordinates.lerp(start, end, 0.5, false, true),
                new GeoCoordinates(15, -175, 0)
            );
        });
        it("wraps coordinates if requested", function () {
            const start = new GeoCoordinates(10, 170, 1000);
            const end = new GeoCoordinates(20, -140, 500);
            assert.deepEqual(
                GeoCoordinates.lerp(start, end, 0.25, true),
                new GeoCoordinates(12.5, 182.5, 875)
            );
        });
        it("reverses interpolation direction when wrapping if needed", function () {
            const start = new GeoCoordinates(20, -140, 500);
            const end = new GeoCoordinates(10, 170, 1000);
            assert.deepEqual(
                GeoCoordinates.lerp(start, end, 0.25, true),
                new GeoCoordinates(17.5, 207.5, 625)
            );
        });
    });
});
