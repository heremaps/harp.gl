/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind, IndexedTechnique } from "@here/harp-datasource-protocol";
import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";
import { Vector2, Vector3 } from "three";

import { VectorTileDataProcessor, VectorTileDataProcessorOptions } from "../index-worker";
import { DataAdapter } from "../lib/DataAdapter";
import { DecodeInfo } from "../lib/DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../lib/IGeometryProcessor";
import { OmvFeatureFilter } from "../lib/OmvDataFilter";
import { OmvGeometryType } from "../lib/OmvDecoderDefs";
import { VectorTileDataEmitter } from "../lib/VectorTileDataEmitter";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

class FakeDataAdapter implements DataAdapter {
    canProcess(data: {} | ArrayBufferLike): boolean {
        return true;
    }

    process(
        data: {} | ArrayBufferLike,
        decodeInfo: DecodeInfo,
        geometryProcessor: IGeometryProcessor
    ): void {}
}

class FakeFeatureFilter implements OmvFeatureFilter {
    hasKindFilter: boolean = true;

    wantsLayer(layer: string, level: number): boolean {
        return true;
    }

    wantsPointFeature(layer: string, geometryType: OmvGeometryType, level: number): boolean {
        return true;
    }

    wantsLineFeature(layer: string, geometryType: OmvGeometryType, level: number): boolean {
        return true;
    }

    wantsPolygonFeature(layer: string, geometryType: OmvGeometryType, level: number): boolean {
        return true;
    }

    wantsKind(kind: string | string[]): boolean {
        return true;
    }
}

describe("VectorTileDataProcessor", function () {
    let processor: VectorTileDataProcessor;
    let dataAdapter: DataAdapter;
    let featureFilter: FakeFeatureFilter;
    let styleSetEvaluator: StyleSetEvaluator;
    const tileKey = new TileKey(0, 0, 2);
    const storageLevelOffset = 1;

    beforeEach(function () {
        styleSetEvaluator = new StyleSetEvaluator({ styleSet: [] });
        dataAdapter = new FakeDataAdapter();
        featureFilter = new FakeFeatureFilter();
        processor = new VectorTileDataProcessor(
            tileKey,
            mercatorProjection,
            styleSetEvaluator,
            dataAdapter,
            { storageLevelOffset } as VectorTileDataProcessorOptions,
            featureFilter
        );
    });

    afterEach(function () {
        sinon.restore();
    });

    function createPointGeometry(): Vector3[] {
        return [new Vector3(0, 0, 0)];
    }

    function createLineGeometry(): ILineGeometry[] {
        return [{ positions: [new Vector2(0, 0), new Vector2(1, 1)] }];
    }

    function createPolygonGeometry(): IPolygonGeometry[] {
        return [{ rings: [[new Vector2(0, 0), new Vector2(1, 1)]] }];
    }

    interface TestInstance {
        processorMethod: "processPointFeature" | "processLineFeature" | "processPolygonFeature";
        geometryType: "point" | "line" | "polygon";
        geometryGenerator: () => any;
    }
    const testInstances: TestInstance[] = [
        {
            processorMethod: "processPointFeature",
            geometryType: "point",
            geometryGenerator: createPointGeometry
        },
        {
            processorMethod: "processLineFeature",
            geometryType: "line",
            geometryGenerator: createLineGeometry
        },
        {
            processorMethod: "processPolygonFeature",
            geometryType: "polygon",
            geometryGenerator: createPolygonGeometry
        }
    ];
    for (const testInstance of testInstances) {
        const processorMethod = testInstance.processorMethod;
        const geometryType = testInstance.geometryType;
        const geometryGenerator = testInstance.geometryGenerator;
        const dummyExtents = 4096;
        const featureId = 42;
        const layerName = "fakelayer";

        describe(`${processorMethod}`, function () {
            it("sets reserved feature properties", function () {
                const styleEvalSpy = sinon.spy(styleSetEvaluator, "getMatchingTechniques");
                sinon
                    .stub(dataAdapter, "process")
                    .callsFake((data, decodeInfo, geometryProcessor: IGeometryProcessor) => {
                        geometryProcessor[processorMethod](
                            layerName,
                            dummyExtents,
                            geometryGenerator(),
                            {},
                            featureId
                        );
                    });
                processor.getDecodedTile({});

                expect(styleEvalSpy.calledOnce).is.true;

                const mapEnv = styleEvalSpy.firstCall.args[0];

                expect(mapEnv.lookup("$layer")).equals(layerName);
                expect(mapEnv.lookup("$id")).equals(featureId);
                expect(mapEnv.lookup("$level")).equals(tileKey.level);
                expect(mapEnv.lookup("$zoom")).equals(tileKey.level - storageLevelOffset);
                expect(mapEnv.lookup("$geometryType")).equals(geometryType);
            });

            it("filters techniques by kind", function () {
                const matchingTechniques: IndexedTechnique[] = [
                    {
                        name: "line",
                        color: "red",
                        lineWidth: 1,
                        _index: 0,
                        _styleSetIndex: 0,
                        kind: GeometryKind.Road
                    },
                    {
                        name: "line",
                        color: "red",
                        lineWidth: 1,
                        _index: 0,
                        _styleSetIndex: 0,
                        kind: GeometryKind.Border
                    }
                ];
                sinon
                    .stub(styleSetEvaluator, "getMatchingTechniques")
                    .callsFake(() => matchingTechniques);
                sinon.stub(styleSetEvaluator, "techniques").get(() => matchingTechniques);
                sinon.stub(styleSetEvaluator, "decodedTechniques").get(() => matchingTechniques);
                sinon
                    .stub(dataAdapter, "process")
                    .callsFake((data, decodeInfo, geometryProcessor: IGeometryProcessor) => {
                        geometryProcessor[processorMethod](
                            layerName,
                            dummyExtents,
                            geometryGenerator(),
                            {},
                            featureId
                        );
                    });

                sinon.stub(featureFilter, "wantsKind").callsFake((kind: string | string[]) => {
                    return kind === GeometryKind.Road;
                });
                const emitterSpy = sinon.spy(
                    VectorTileDataEmitter.prototype,
                    processorMethod as any
                );

                processor.getDecodedTile({});

                expect(emitterSpy.calledOnce);
                const filteredTechniques = emitterSpy.firstCall.args[4] as IndexedTechnique[];
                expect(filteredTechniques).to.have.lengthOf(1);
                expect(filteredTechniques[0].kind).equals(GeometryKind.Road);
            });
        });
    }
});
