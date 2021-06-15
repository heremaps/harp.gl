/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";

import { GeoJsonVtDataAdapter } from "../lib/adapters/geojson-vt/GeoJsonVtDataAdapter";
import { DecodeInfo } from "../lib/DecodeInfo";
import { MockGeometryProcessor } from "./MockGeometryProcessor";

enum VTJsonGeometryType {
    Unknown,
    Point,
    LineString,
    Polygon
}

// A multipolygon composed by 2 polygons:
// Polygon#1: [exterior, interior]
// Polygon#2: [exterior, interior, interior]
const multipolygon = [
    // START polygon with 1 exterior ring, 1 interior.
    [
        [1, 1],
        [10, 1],
        [10, 10],
        [1, 10]
    ], // exterior CW
    [
        [2, 8],
        [8, 8],
        [8, 2],
        [2, 2]
    ], // interior CCW
    // END
    // START polygon with 1 exterior ring, 2 interiors - note: whether they overlap it's not relevant
    [
        [1, 1],
        [10, 1],
        [10, 10],
        [1, 10]
    ], // exterior CW
    [
        [2, 8],
        [8, 8],
        [8, 2],
        [2, 2]
    ], // interior CCW
    [
        [2, 8],
        [8, 8],
        [8, 2],
        [2, 2]
    ] // interior CCW
];
const geojsonVtTile = {
    features: [
        {
            type: VTJsonGeometryType.Point,
            id: "point id",
            tags: {},

            geometry: [[1, 2]]
        },
        {
            type: VTJsonGeometryType.LineString,
            id: "line id",
            tags: {},

            geometry: [
                [
                    [1, 2],
                    [3, 4]
                ]
            ]
        },
        {
            type: VTJsonGeometryType.Polygon,
            id: "polygon id",
            tags: {},
            geometry: multipolygon
        }
    ],
    maxX: 0,
    maxY: 0,
    minX: 0,
    minY: 0,
    numFeatures: 3,
    numPoints: 1,
    numSimplified: 0,
    source: [],
    transformed: false,
    x: 0,
    y: 0,
    z: 0,
    layer: ""
};

describe("GeoJsonVtDataAdapter", function () {
    let decodeInfo: DecodeInfo;
    let geometryProcessor: MockGeometryProcessor;
    let adapter: GeoJsonVtDataAdapter;

    beforeEach(function () {
        decodeInfo = new DecodeInfo(mercatorProjection, new TileKey(0, 0, 1));
        geometryProcessor = new MockGeometryProcessor();
        adapter = new GeoJsonVtDataAdapter();
    });

    it("canProcess returns true for a geojson-vt Tile", function () {
        expect(adapter.canProcess(geojsonVtTile as any)).to.be.true;
    });

    it("process tile's polygon geometries and create a single polygon from nested rings", function () {
        const polygonSpy = sinon.spy(geometryProcessor, "processPolygonFeature");
        adapter.process(geojsonVtTile as any, decodeInfo, geometryProcessor);

        expect(polygonSpy.calledOnce);
        const polygons = polygonSpy.getCalls()[0].args[2];
        expect(polygons.length).equals(2);
    });
});
