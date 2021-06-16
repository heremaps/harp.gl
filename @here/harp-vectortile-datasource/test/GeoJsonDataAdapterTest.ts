/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";

import { GeoJsonDataAdapter } from "../lib/adapters/geojson/GeoJsonDataAdapter";

const featureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            id: "point id",
            properties: {},

            geometry: {
                type: "Point",
                coordinates: [1, 2]
            }
        },
        {
            type: "Feature",
            id: "line id",
            properties: {},

            geometry: {
                type: "LineString",
                coordinates: [
                    [1, 2],
                    [3, 4]
                ]
            }
        },
        {
            type: "Feature",
            id: "polygon id",
            properties: {},

            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [1, 2],
                        [3, 4],
                        [5, 6]
                    ]
                ]
            }
        }
    ]
};

describe("GeoJsonDataAdapter", function () {
    let adapter: GeoJsonDataAdapter;

    beforeEach(function () {
        adapter = new GeoJsonDataAdapter();
    });

    it("canProcess returns true for a FeatureCollection", function () {
        expect(adapter.canProcess(featureCollection as any)).to.be.true;
    });
});
