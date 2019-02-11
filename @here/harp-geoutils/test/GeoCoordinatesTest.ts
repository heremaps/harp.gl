/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { GeoCoordinates } from "../lib/coordinates/GeoCoordinates";

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
        { args: [361, 123, 50], expected: [1, 123, 50] }
    ];

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
