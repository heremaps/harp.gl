/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";

import { GeoJsonDataAdapter } from "../lib/adapters/geojson/GeoJsonDataAdapter";
import { DecodeInfo } from "../lib/DecodeInfo";
import { FakeOmvFeatureFilter } from "./FakeOmvFeatureFilter";
import { MockGeometryProcessor } from "./MockGeometryProcessor";

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
    let decodeInfo: DecodeInfo;
    let geometryProcessor: MockGeometryProcessor;
    let adapter: GeoJsonDataAdapter;

    beforeEach(function () {
        decodeInfo = new DecodeInfo("", mercatorProjection, new TileKey(0, 0, 1));
        geometryProcessor = new MockGeometryProcessor();
        adapter = new GeoJsonDataAdapter(geometryProcessor, new FakeOmvFeatureFilter());
    });

    it("canProcess returns true for a FeatureCollection", function () {
        expect(adapter.canProcess(featureCollection as any)).to.be.true;
    });

    it("process copies geojson feature's id to env's $id", function () {
        const pointSpy = sinon.spy(geometryProcessor, "processPointFeature");
        const lineSpy = sinon.spy(geometryProcessor, "processLineFeature");
        const polygonSpy = sinon.spy(geometryProcessor, "processPolygonFeature");
        adapter.process(featureCollection as any, decodeInfo);

        expect(pointSpy.calledOnce);
        const pointEnv = pointSpy.getCalls()[0].args[3];
        expect(pointEnv.lookup("$id")).equals(featureCollection.features[0].id);

        expect(lineSpy.calledOnce);
        const lineEnv = lineSpy.getCalls()[0].args[3];
        expect(lineEnv.lookup("$id")).equals(featureCollection.features[1].id);

        expect(polygonSpy.calledOnce);
        const polygonEnv = polygonSpy.getCalls()[0].args[3];
        expect(polygonEnv.lookup("$id")).equals(featureCollection.features[2].id);
    });
});
