/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
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
