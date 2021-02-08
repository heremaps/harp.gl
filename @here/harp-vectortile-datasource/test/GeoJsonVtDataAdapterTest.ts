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
import { FakeOmvFeatureFilter } from "./FakeOmvFeatureFilter";
import { MockGeometryProcessor } from "./MockGeometryProcessor";

enum VTJsonGeometryType {
    Unknown,
    Point,
    LineString,
    Polygon
}

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
            geometry: [
                [
                    [1, 2],
                    [3, 4],
                    [5, 6]
                ]
            ]
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
        decodeInfo = new DecodeInfo("", mercatorProjection, new TileKey(0, 0, 1));
        geometryProcessor = new MockGeometryProcessor();
        adapter = new GeoJsonVtDataAdapter(geometryProcessor, new FakeOmvFeatureFilter());
    });

    it("canProcess returns true for a geojson-vt Tile", function () {
        expect(adapter.canProcess(geojsonVtTile as any)).to.be.true;
    });

    it("process copies geojson-vt feature's id to env's $id", function () {
        const pointSpy = sinon.spy(geometryProcessor, "processPointFeature");
        const lineSpy = sinon.spy(geometryProcessor, "processLineFeature");
        const polygonSpy = sinon.spy(geometryProcessor, "processPolygonFeature");
        adapter.process(geojsonVtTile as any, decodeInfo);

        expect(pointSpy.calledOnce);
        const pointEnv = pointSpy.getCalls()[0].args[3];
        expect(pointEnv.lookup("$id")).equals(geojsonVtTile.features[0].id);

        expect(lineSpy.calledOnce);
        const lineEnv = lineSpy.getCalls()[0].args[3];
        expect(lineEnv.lookup("$id")).equals(geojsonVtTile.features[1].id);

        expect(polygonSpy.calledOnce);
        const polygonEnv = polygonSpy.getCalls()[0].args[3];
        expect(polygonEnv.lookup("$id")).equals(geojsonVtTile.features[2].id);
    });
});
