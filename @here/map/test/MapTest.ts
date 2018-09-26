/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

// tslint:disable:only-arrow-functions

import { assert } from "chai";
import { LocationOption } from "../lib/Map";

describe("Map", () => {
    it("LocationOptions", function() {
        let result = LocationOption.toGeoCoordinates([46.5424279, 10.5306749]);
        assert.strictEqual(result.latitude, 46.5424279);
        assert.strictEqual(result.longitude, 10.5306749);

        result = LocationOption.toGeoCoordinates("49.3595217,2.5268811");
        assert.strictEqual(result.latitude, 49.3595217);
        assert.strictEqual(result.longitude, 2.5268811);

        result = LocationOption.toGeoCoordinates({ latitude: 46, longitude: 10 });
        assert.strictEqual(result.latitude, 46);
        assert.strictEqual(result.longitude, 10);
    });
});
