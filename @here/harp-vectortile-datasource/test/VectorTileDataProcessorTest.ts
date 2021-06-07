/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeometryKind, IndexedTechnique } from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import { mercatorProjection, TileKey } from "@here/harp-geoutils";
import { expect } from "chai";
import * as sinon from "sinon";
import { Vector2, Vector3 } from "three";

import { VectorTileDataProcessor } from "../index-worker";
import { DataAdapter } from "../lib/DataAdapter";
import { DecodeInfo } from "../lib/DecodeInfo";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "../lib/IGeometryProcessor";
import { OmvFeatureFilter, OmvFeatureModifier } from "../lib/OmvDataFilter";
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

class FakeFeatureModifier implements OmvFeatureModifier {
    doProcessPointFeature(layer: string, env: MapEnv, level: number): boolean {
        return true;
    }

    doProcessLineFeature(layer: string, env: MapEnv, level: number): boolean {
        return true;
    }

    doProcessPolygonFeature(layer: string, env: MapEnv, level: number): boolean {
        return true;
    }
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
    const sandbox = sinon.createSandbox();
    let processor: VectorTileDataProcessor;
    let dataAdapter: DataAdapter;
    let featureFilter: FakeFeatureFilter;
    let featureModifier: FakeFeatureModifier;
    let styleSetEvaluator: StyleSetEvaluator;
    const tileKey = new TileKey(0, 0, 2);
    const storageLevelOffset = 1;

    beforeEach(function () {
        styleSetEvaluator = new StyleSetEvaluator({ styleSet: [] });
        dataAdapter = new FakeDataAdapter();
        featureFilter = new FakeFeatureFilter();
        featureModifier = new FakeFeatureModifier();
        processor = new VectorTileDataProcessor(
            tileKey,
            mercatorProjection,
            styleSetEvaluator,
            false,
            dataAdapter,
            featureFilter,
            [featureModifier],
            false,
            true,
            storageLevelOffset
        );
    });

    afterEach(function () {
        sandbox.restore();
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
        modifierMethod:
            | "doProcessPointFeature"
            | "doProcessLineFeature"
            | "doProcessPolygonFeature";
        geometryType: "point" | "line" | "polygon";
        geometryGenerator: () => any;
    }
    const testInstances: TestInstance[] = [
        {
            processorMethod: "processPointFeature",
            modifierMethod: "doProcessPointFeature",
            geometryType: "point",
            geometryGenerator: createPointGeometry
        },
        {
            processorMethod: "processLineFeature",
            modifierMethod: "doProcessLineFeature",
            geometryType: "line",
            geometryGenerator: createLineGeometry
        },
        {
            processorMethod: "processPolygonFeature",
            modifierMethod: "doProcessPolygonFeature",
            geometryType: "polygon",
            geometryGenerator: createPolygonGeometry
        }
    ];
    for (const testInstance of testInstances) {
        const processorMethod = testInstance.processorMethod;
        const modifierMethod = testInstance.modifierMethod;
        const geometryType = testInstance.geometryType;
        const geometryGenerator = testInstance.geometryGenerator;
        const dummyExtents = 4096;
        const featureId = 42;
        const layerName = "fakelayer";

        describe(`${processorMethod}`, function () {
            it("sets reserved feature properties", function () {
                const styleEvalSpy = sinon.spy(styleSetEvaluator, "getMatchingTechniques");
                sandbox
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

            it("applies feature modifiers before finding matching techniques", function () {
                const modifiedValue = 42;
                sandbox
                    .stub(featureModifier, modifierMethod as any)
                    .callsFake((layer: string, env: MapEnv, level: number) => {
                        if (env.lookup("prop") !== undefined) {
                            env.entries["prop"] = modifiedValue;
                            return true;
                        }
                        return false;
                    });

                const styleEvalSpy = sinon.spy(styleSetEvaluator, "getMatchingTechniques");

                sandbox
                    .stub(dataAdapter, "process")
                    .callsFake((data, decodeInfo, geometryProcessor: IGeometryProcessor) => {
                        geometryProcessor[processorMethod](
                            layerName,
                            dummyExtents,
                            geometryGenerator(),
                            { prop: 0 },
                            featureId
                        );
                        geometryProcessor[processorMethod](
                            layerName,
                            dummyExtents,
                            geometryGenerator(),
                            {},
                            featureId + 1
                        );
                    });

                processor.getDecodedTile({});

                expect(styleEvalSpy.calledOnce).is.true;

                const mapEnv = styleEvalSpy.firstCall.args[0];
                expect(mapEnv.lookup("prop")).equals(modifiedValue);
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
                sandbox
                    .stub(styleSetEvaluator, "getMatchingTechniques")
                    .callsFake(() => matchingTechniques);
                sandbox.stub(styleSetEvaluator, "techniques").get(() => matchingTechniques);
                sandbox.stub(styleSetEvaluator, "decodedTechniques").get(() => matchingTechniques);
                sandbox
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
                const emitterSpy = sandbox.spy(
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
