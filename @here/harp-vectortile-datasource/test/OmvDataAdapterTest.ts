/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";

import { OmvDataAdapter } from "../lib/adapters/omv/OmvDataAdapter";
import { com } from "../lib/adapters/omv/proto/vector_tile";
import { DecodeInfo } from "../lib/DecodeInfo";
import { FakeOmvFeatureFilter } from "./FakeOmvFeatureFilter";
import { MockGeometryProcessor } from "./MockGeometryProcessor";

enum VTJsonGeometryType {
    Unknown,
    Point,
    LineString,
    Polygon
}

// Encoded geometries - https://docs.mapbox.com/vector-tiles/specification/#encoding-geometry
// See https://github.com/mapbox/vector-tile-spec/blob/master/2.1/README.md#4356-example-multi-polygon
// Polygon 1:
// Exterior Ring: CW
// (0,0)
// (10,0)
// (10,10)
// (0,10)
// (0,0)
// Polygon 2:
// Exterior Ring: CW
// (11,11)
// (20,11)
// (20,20)
// (11,20)
// Interior Ring: CCW
// (13,13)
// (13,17)
// (17,17)
// (17,13)

const MultiPolygon = [
    9,
    0,
    0,
    26,
    20,
    0,
    0,
    20,
    19,
    0,
    15, // end Polygon1
    9,
    22,
    2,
    26,
    18,
    0,
    0,
    18,
    17,
    0,
    15, // end Polygon2#exterior
    9,
    4,
    13,
    26,
    0,
    8,
    8,
    0,
    0,
    7,
    15 // end Polygon2#interior
];
// MultiPolygon with rings having opposite winding
// Polygon#1 - [ext:CCW]
// Polygon#2 - [ext:CCW, int:CW]
const WrongWindingMultiPolygon = [
    9,
    0,
    0,
    26,
    0,
    20,
    20,
    0,
    0,
    19,
    15, // end Polygon1
    9,
    2,
    22,
    26,
    0,
    18,
    18,
    0,
    0,
    17,
    15, // end Polygon2#exterior
    9,
    13,
    4,
    26,
    0,
    0,
    8,
    7,
    0,
    15 // end Polygon2#interior
];

const MVTLayer = {
    name: "layer",
    features: [
        {
            type: VTJsonGeometryType.Polygon,
            id: 1,
            tags: {},
            geometry: MultiPolygon
        }
    ]
};
const MVTTile = {
    layers: [MVTLayer]
};

describe("OmvDataAdapter", function () {
    let decodeInfo: DecodeInfo;
    let geometryProcessor: MockGeometryProcessor;
    let adapter: OmvDataAdapter;
    let TileDecodeStub: any;

    beforeEach(function () {
        decodeInfo = new DecodeInfo("", mercatorProjection, new TileKey(0, 0, 1));
        geometryProcessor = new MockGeometryProcessor();
        adapter = new OmvDataAdapter(geometryProcessor, new FakeOmvFeatureFilter());
        TileDecodeStub = sinon.stub(com.mapbox.pb.Tile, "decode");
    });

    afterEach(function () {
        sinon.restore();
    });

    it("process polygon geometries with correct winding", function () {
        const polygonSpy = sinon.spy(geometryProcessor, "processPolygonFeature");
        TileDecodeStub.returns(MVTTile);
        adapter.process(1 as any, decodeInfo);
        const polygons = polygonSpy.getCalls()[0].args[2];
        expect(polygons.length).equals(2);
    });

    it("process polygon geometries with opposite winding", function () {
        const polygonSpy = sinon.spy(geometryProcessor, "processPolygonFeature");
        const tile = { ...MVTTile };
        const layer = { ...MVTLayer };
        const fakeData = 1;

        layer.features[0].geometry = WrongWindingMultiPolygon;
        tile.layers = [layer];
        TileDecodeStub.returns(tile);

        adapter.process(fakeData as any, decodeInfo);
        const polygons = polygonSpy.getCalls()[0].args[2];
        expect(polygons.length).equals(2);
    });
});
