/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";

import { OmvDataAdapter } from "../lib/adapters/omv/OmvDataAdapter";
import { com } from "../lib/adapters/omv/proto/vector_tile";
import { DecodeInfo } from "../lib/DecodeInfo";
import { OmvFeatureFilterDescriptionBuilder } from "../lib/OmvDataFilter";
import {
    OmvFeatureFilterDescription,
    OmvFilterDescription,
    OmvFilterString,
    OmvGeometryType
} from "../lib/OmvDecoderDefs";
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

const line = [9, 0, 0, 26, 20, 0, 0, 20, 19, 0, 15];

const point = [9, 0, 0, 15];

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
    let styleSetEvaluator: StyleSetEvaluator;
    let TileDecodeStub: any;

    beforeEach(function () {
        decodeInfo = new DecodeInfo(mercatorProjection, new TileKey(0, 0, 1));
        geometryProcessor = new MockGeometryProcessor();
        adapter = new OmvDataAdapter();
        styleSetEvaluator = new StyleSetEvaluator({ styleSet: [] });
        sinon.stub(styleSetEvaluator, "wantsLayer").returns(true);
        sinon.stub(styleSetEvaluator, "wantsFeature").returns(true);
        TileDecodeStub = sinon.stub(com.mapbox.pb.Tile, "decode");
    });

    afterEach(function () {
        sinon.restore();
    });

    it("process polygon geometries with correct winding", function () {
        const polygonSpy = sinon.spy(geometryProcessor, "processPolygonFeature");
        TileDecodeStub.returns(MVTTile);
        adapter.process(1 as any, decodeInfo, geometryProcessor);
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

        adapter.process(fakeData as any, decodeInfo, geometryProcessor);
        const polygons = polygonSpy.getCalls()[0].args[2];
        expect(polygons.length).equals(2);
    });

    const layerName = "boundaries";
    const attrKey = "fakeAttribute";
    const attrValue = 42;
    const defFeatureFilter = new OmvFeatureFilterDescriptionBuilder().createDescription();
    const defFilter: OmvFilterDescription = {
        layerName: { value: layerName, match: OmvFilterString.StringMatch.Match },
        minLevel: 0,
        maxLevel: 20,
        geometryTypes: [OmvGeometryType.POINT, OmvGeometryType.LINESTRING, OmvGeometryType.POLYGON]
    };
    interface TestInstance {
        visitMethod: "visitPointFeature" | "visitLineFeature" | "visitPolygonFeature";
        processorMethod: "processPointFeature" | "processLineFeature" | "processPolygonFeature";
        geometryType: com.mapbox.pb.Tile.GeomType;
        geometry: number[];
        filterDescription: OmvFeatureFilterDescription;
        modifierDescription: OmvFeatureFilterDescription;
    }
    const testInstances: TestInstance[] = [
        {
            visitMethod: "visitPointFeature",
            processorMethod: "processPointFeature",
            geometryType: com.mapbox.pb.Tile.GeomType.POINT,
            geometry: point,
            filterDescription: { ...defFeatureFilter, processPointsDefault: false },
            modifierDescription: {
                ...defFeatureFilter,
                processPointsDefault: false,
                pointsToProcess: [
                    {
                        ...defFilter,
                        featureAttribute: { key: attrKey, value: attrValue }
                    }
                ]
            }
        },
        {
            visitMethod: "visitLineFeature",
            processorMethod: "processLineFeature",
            geometryType: com.mapbox.pb.Tile.GeomType.LINESTRING,
            geometry: line,
            filterDescription: { ...defFeatureFilter, processLinesDefault: false },
            modifierDescription: {
                ...defFeatureFilter,
                processLinesDefault: false,
                linesToProcess: [
                    {
                        ...defFilter,
                        featureAttribute: { key: attrKey, value: attrValue }
                    }
                ]
            }
        },
        {
            visitMethod: "visitPolygonFeature",
            processorMethod: "processPolygonFeature",
            geometryType: com.mapbox.pb.Tile.GeomType.POLYGON,
            geometry: MultiPolygon,
            filterDescription: { ...defFeatureFilter, processPolygonsDefault: false },
            modifierDescription: {
                ...defFeatureFilter,
                processPolygonsDefault: false,
                polygonsToProcess: [
                    {
                        ...defFilter,
                        featureAttribute: { key: attrKey, value: attrValue }
                    }
                ]
            }
        }
    ];
    for (const testInstance of testInstances) {
        const visitMethod = testInstance.visitMethod;
        const processorMethod = testInstance.processorMethod;
        const type = testInstance.geometryType;
        const geometry = testInstance.geometry;
        const filterDescription = testInstance.filterDescription;
        const modifierDescription = testInstance.modifierDescription;

        const extent = 4096;
        const layer: com.mapbox.pb.Tile.ILayer = {
            version: 0,
            name: layerName,
            extent,
            keys: ["kind:aq", "id"],
            values: [{ stringValue: "disputed boundary" }, { intValue: 42 }]
        };
        const kindTags = [0, 0]; // Indices to attributes names in layer.keys and values in layer.values.
        const idTags = [1, 1]; // Indices to id attribute name and value.

        describe(`${visitMethod}`, function () {
            let processSpy: sinon.SinonSpy<any>;
            beforeEach(function () {
                processSpy = sinon.spy(geometryProcessor, processorMethod);
                TileDecodeStub.returns({ layers: [] });
                adapter.process(new ArrayBuffer(0), decodeInfo, geometryProcessor);
                adapter.visitLayer(layer);
            });

            it("gets feature id from properties if present, otherwise from feature.id", function () {
                adapter.configure({}, styleSetEvaluator);
                const featureId = 13;
                adapter[visitMethod]({ geometry, type, id: featureId, tags: idTags });

                expect(processSpy.calledOnce).is.true;
                const id = processSpy.firstCall.args[4];
                expect(id).equals(layer.values![1].intValue);
                processSpy.resetHistory();

                // Remove the id property, id should be taken now from feature.id.
                adapter.configure({}, styleSetEvaluator);
                adapter[visitMethod]({ geometry, type, id: featureId });

                expect(processSpy.calledOnce).is.true;
                const newId = processSpy.firstCall.args[4];
                expect(newId).equals(featureId);
            });

            it("applies feature modifiers before finding matching techniques", function () {
                // Filter out feature using attribute value, checked by modifier.
                adapter.configure({ filterDescription: modifierDescription }, styleSetEvaluator);
                adapter[visitMethod]({ geometry, type });

                expect(processSpy.calledOnce).is.false;

                // Remove the modifier and check the feature reaches the geometry processor.
                adapter.configure({ filterDescription: null }, styleSetEvaluator);
                adapter[visitMethod]({ geometry, type });

                expect(processSpy.calledOnce).is.true;
            });

            if (type === com.mapbox.pb.Tile.GeomType.LINESTRING) {
                it("applies political view modifiers", function () {
                    // Configure political view.
                    adapter.configure({ politicalView: "aq" }, styleSetEvaluator);
                    adapter[visitMethod]({ geometry, type, tags: kindTags });

                    expect(processSpy.calledOnce).is.true;
                    const kind = processSpy.firstCall.args[3]["kind"];
                    expect(kind).equals(layer.values![0].stringValue);
                    processSpy.resetHistory();

                    // Set to default political view.
                    adapter.configure({ politicalView: "" }, styleSetEvaluator);
                    adapter[visitMethod]({ geometry, type, tags: kindTags });

                    expect(processSpy.calledOnce).is.true;
                    const newKind = processSpy.firstCall.args[3]["kind"];
                    expect(newKind).to.be.undefined;
                });
            }

            it("filters features", function () {
                // Filter out feature geometry type entirely.
                adapter.configure({ filterDescription }, styleSetEvaluator);
                adapter[visitMethod]({ geometry, type });

                expect(processSpy.calledOnce).is.false;

                // Remove the filter and check the feature reaches the geometry processor.
                adapter.configure({ filterDescription: null }, styleSetEvaluator);
                adapter[visitMethod]({ geometry, type });

                expect(processSpy.calledOnce).is.true;
            });

            if (type !== com.mapbox.pb.Tile.GeomType.POINT) {
                // (0,0) -> (extent-1,extent-1)
                const lineAtBorder = [9, 0, 0, 10, (extent - 1) << 1, (extent - 1) << 1, 15];

                function getEndCoords() {
                    expect(processSpy.calledOnce);
                    const geometries = processSpy.firstCall.args[2];
                    expect(geometries).has.lengthOf(1);
                    const geometry = geometries[0];
                    processSpy.resetHistory();
                    return geometry.positions ? geometry.positions[1] : geometry.rings[0][1];
                }

                it("does not round up x coordinates by default", function () {
                    adapter.configure({}, styleSetEvaluator);

                    adapter[visitMethod]({ geometry: lineAtBorder, type });

                    const endCoord = getEndCoords();
                    expect(endCoord.x).equals(extent - 1);
                    expect(endCoord.y).equals(extent - 1);
                });

                it("does not round up x coordinates if tile is not at antimer. on level <5", function () {
                    adapter.configure({ roundUpCoordinatesIfNeeded: true }, styleSetEvaluator);
                    // Level too high.
                    adapter.process(
                        new ArrayBuffer(0),
                        { tileKey: new TileKey(0, TileKey.columnsAtLevel(5) - 1, 5) } as DecodeInfo,
                        geometryProcessor
                    );

                    adapter[visitMethod]({ geometry: lineAtBorder, type });

                    {
                        const endCoord = getEndCoords();
                        expect(endCoord.x).equals(extent - 1);
                        expect(endCoord.y).equals(extent - 1);
                    }

                    // Tile not at antimeridian.
                    adapter.process(
                        new ArrayBuffer(0),
                        { tileKey: new TileKey(0, TileKey.columnsAtLevel(4) - 2, 4) } as DecodeInfo,
                        geometryProcessor
                    );

                    adapter[visitMethod]({ geometry: lineAtBorder, type });

                    const endCoord = getEndCoords();
                    expect(endCoord.x).equals(extent - 1);
                    expect(endCoord.y).equals(extent - 1);
                });

                it("rounds up x coordinates if flag set and tile at antimeridian on level <5", function () {
                    adapter.configure({ roundUpCoordinatesIfNeeded: true }, styleSetEvaluator);

                    adapter.process(
                        new ArrayBuffer(0),
                        { tileKey: new TileKey(0, TileKey.columnsAtLevel(4) - 1, 4) } as DecodeInfo,
                        geometryProcessor
                    );

                    adapter[visitMethod]({ geometry: lineAtBorder, type });

                    const endCoord = getEndCoords();
                    expect(endCoord.x).equals(extent);
                    expect(endCoord.y).equals(extent - 1);
                    processSpy.resetHistory();
                });
            }
        });
    }
});
