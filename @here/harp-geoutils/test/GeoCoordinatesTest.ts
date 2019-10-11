/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";
import { GeoPointLike, isGeoPointLike } from "../lib/coordinates/GeoPointLike";

describe("GeoCoordinates", function() {
    const tests = [
        { args: [90, 180], expected: [90, 180] },
        { args: [-90, -180], expected: [-90, -180] },
        { args: [0, 0], expected: [0, 0] },
        { args: [90, 250], expected: [90, -110] },
        { args: [91, 123], expected: [89, -57] },
        { args: [360, 123], expected: [0, 123] },
        { args: [451, 123], expected: [89, -57] },
        { args: [-91, 123], expected: [-89, -57] },
        { args: [181, 123], expected: [-1, -57] },
        { args: [359, 123], expected: [-1, 123] },
        { args: [271, 123], expected: [-89, 123] },
        { args: [-360, 123], expected: [0, 123] },
        { args: [361, 123], expected: [1, 123] },
        { args: [-360, 123, 0], expected: [0, 123, 0] },
        { args: [361, 123, 50], expected: [1, 123, 50] },
        { args: [361, -720, 50], expected: [1, 0, 50] },
        { args: [361, -711, 50], expected: [1, 9, 50] },
        { args: [361, -4534, 50], expected: [1, 146, 50] },
        { args: [361, 4534, 50], expected: [1, -146, 50] }
    ];

    it("API compatibility", function() {
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

    tests.forEach(function(test) {
        it(
            "normalized GeoCoordinates { " +
                test.args[0] +
                ", " +
                test.args[1] +
                ", " +
                test.args[2] +
                " }",
            function() {
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
});
