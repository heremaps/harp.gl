/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureCollection } from "@here/harp-datasource-protocol";
import { TileKey } from "@here/harp-geoutils";
import { expect } from "chai";

import { GeoJsonTiler } from "../lib/GeoJsonTiler";

const featureCollection: FeatureCollection = {
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

describe("GeoJsonTiler", function () {
    let tiler: GeoJsonTiler;

    beforeEach(function () {
        tiler = new GeoJsonTiler();
    });

    it("returns features with their original geojson ids", async function () {
        const indexId = "dummy";
        await tiler.registerIndex(indexId, featureCollection);

        const tile = (await tiler.getTile(indexId, new TileKey(0, 0, 1))) as any;

        expect(tile.features).has.lengthOf(3);
        const expectedFeatureIds = featureCollection.features.map(feature => feature.id);
        const actualFeatureIds: string[] = tile.features.map(
            (feature: { id: string }) => feature.id
        );
        expect(actualFeatureIds).has.members(expectedFeatureIds);
    });
});
