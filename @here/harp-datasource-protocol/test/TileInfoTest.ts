/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { TileKey } from "@here/harp-geoutils";
import { MapEnv } from "../lib/Expr";
import { IndexedTechnique, Technique } from "../lib/Techniques";
import {
    ExtendedTileInfo,
    ExtendedTileInfoPolygonAccessor,
    ExtendedTileInfoVisitor,
    ExtendedTileInfoWriter,
    FeatureGroup,
    FeatureGroupType,
    PolygonFeatureGroup
} from "../lib/TileInfo";

import { assert } from "chai";

describe("ExtendedTileInfo", function() {
    const tileKey = new TileKey(0, 0, 0);

    interface RingData {
        isOuter: boolean;
        contour: number[];
    }
    interface TileInfoValues {
        featureId?: number;
        techniqueIndex: number;
        x?: number;
        y?: number;
        label: number;
        layerName: number;
        className: number;
        typeName: number;
        points?: ArrayLike<number>;
        pointsStart?: number;
        numPointValues?: number;
        rings?: RingData[];
    }

    class TileHandler {
        results: TileInfoValues[] = new Array<TileInfoValues>();

        get lastValues(): TileInfoValues {
            assert(this.results.length > 0);
            return this.results[this.results.length - 1];
        }

        acceptPoint(
            featureId: number | undefined,
            techniqueIndex: number,
            x: number,
            y: number,
            label: number,
            layerName: number,
            className: number,
            typeName: number
        ): void {
            this.results.push({
                featureId,
                techniqueIndex,
                x,
                y,
                label,
                layerName,
                className,
                typeName
            });
        }

        acceptLine(
            featureId: number | undefined,
            techniqueIndex: number,
            label: number,
            layerName: number,
            className: number,
            typeName: number,
            points: ArrayLike<number>,
            pointsStart: number,
            numPointValues: number
        ): void {
            this.results.push({
                featureId,
                techniqueIndex,
                label,
                layerName,
                className,
                typeName,
                points,
                pointsStart,
                numPointValues
            });
        }

        acceptPolygon(
            featureId: number | undefined,
            techniqueIndex: number,
            label: number,
            layerName: number,
            className: number,
            typeName: number,
            polygonAccessor: ExtendedTileInfoPolygonAccessor
        ): void {
            const info: TileInfoValues = {
                featureId,
                techniqueIndex,
                label,
                layerName,
                className,
                typeName
            };
            this.results.push(info);

            info.rings = new Array<RingData>();

            const numRings = polygonAccessor.numRings;

            for (let i = 0; i < numRings; i++) {
                const ringInfo = polygonAccessor.getPoints(i);

                const contour: number[] = Array.prototype.slice.call(
                    ringInfo.points,
                    ringInfo.pointsStart,
                    (ringInfo.pointsStart || 0) + (ringInfo.numPointValues || 0)
                );

                const ring: RingData = {
                    isOuter: polygonAccessor.isOuterRing(i),
                    contour
                };
                info.rings.push(ring);
            }
        }
    }

    // tslint:disable:no-unused-variable
    class NullTileHandler {
        static numPointsHandled = 0;
        static numLinesHandled = 0;
        static numPolygonsHandled = 0;

        acceptPoint(
            featureId: number | undefined,
            techniqueIndex: Technique,
            x: number,
            y: number,
            label: string | undefined,
            layerName: string | undefined,
            className: string | undefined,
            typeName: string | undefined
        ): void {
            NullTileHandler.numPointsHandled++;
        }

        acceptLine(
            featureId: number | undefined,
            techniqueIndex: Technique,
            label: string | undefined,
            layerName: string | undefined,
            className: string | undefined,
            typeName: string | undefined,
            points: ArrayLike<number>,
            pointsStart: number,
            numPointValues: number
        ): void {
            NullTileHandler.numLinesHandled++;
        }

        acceptPolygon(
            featureId: number | undefined,
            techniqueIndex: Technique,
            label: string | undefined,
            layerName: string | undefined,
            className: string | undefined,
            typeName: string | undefined,
            polygonAccessor: ExtendedTileInfoPolygonAccessor
        ): void {
            NullTileHandler.numPolygonsHandled++;
            if (polygonAccessor) {
                const numRings = polygonAccessor.numRings;

                for (let i = 0; i < numRings; i++) {
                    const ringInfo = polygonAccessor.getPoints(i);
                }
            }
        }
    }
    // tslint:enable:no-unused-variable

    function checkLinePoints(result: TileInfoValues, testPoints: number[]) {
        assert.exists(result.points);
        assert.exists(result.pointsStart);
        assert.isAtLeast(result.pointsStart === undefined ? -1 : result.pointsStart, 0);

        assert.deepEqual(
            Array.prototype.slice.call(
                result.points,
                result.pointsStart,
                (result.pointsStart || 0) + (result.numPointValues || 0)
            ),
            testPoints
        );
    }

    function createPointInfo(
        index: number
    ): {
        technique: IndexedTechnique;
        storedTechnique: IndexedTechnique;
        env: MapEnv;
    } {
        const technique: IndexedTechnique = {
            name: "squares",
            color: "#F00",
            size: index,
            renderOrder: 0,
            _index: index,
            _styleSetIndex: index
        };
        const storedTechnique: IndexedTechnique = {
            name: "squares",
            color: "#F00",
            size: index,
            renderOrder: 0,
            _index: index,
            _styleSetIndex: index
        };
        const env = new MapEnv({
            $layer: "point_layer-" + index,
            class: "point_class-" + index,
            type: "point_type-" + index,
            name: "point_label-" + index
        });

        return {
            technique,
            storedTechnique,
            env
        };
    }

    function createLineInfo(
        index: number
    ): {
        technique: IndexedTechnique;
        storedTechnique: IndexedTechnique;
        env: MapEnv;
    } {
        const technique: IndexedTechnique = {
            name: "line",
            color: "#0F0",
            lineWidth: index,
            renderOrder: 0,
            _index: index,
            _styleSetIndex: index
        };
        const storedTechnique: IndexedTechnique = {
            name: "line",
            color: "#0F0",
            lineWidth: index,
            renderOrder: 0,
            _index: index,
            _styleSetIndex: index
        };
        const env = new MapEnv({
            $layer: "line_layer-" + index,
            class: "line_class-" + index,
            type: "line_type-" + index,
            name: "lineLabel-" + index
        });

        return {
            technique,
            storedTechnique,
            env
        };
    }

    function createPolygonInfo(
        index: number
    ): {
        technique: IndexedTechnique;
        storedTechnique: IndexedTechnique;
        env: MapEnv;
    } {
        const technique: IndexedTechnique = {
            name: "fill",
            color: "#00f",
            renderOrder: 0,
            _index: index,
            _styleSetIndex: index
        };
        const storedTechnique: IndexedTechnique = {
            name: "fill",
            color: "#00f",
            renderOrder: 0,
            _index: index,
            _styleSetIndex: index
        };
        const env = new MapEnv({
            $layer: "fill_layer-" + index,
            class: "fill_class-" + index,
            type: "fill_type-" + index,
            name: "fillLabel-" + index
        });

        return {
            technique,
            storedTechnique,
            env
        };
    }

    function checkFeatureGroup(featureGroup: FeatureGroup) {
        const numFeatures = featureGroup.numFeatures;
        assert.equal(numFeatures, featureGroup.textIndex.length);
        if (featureGroup.layerIndex) {
            assert.equal(numFeatures, featureGroup.layerIndex.length);
        }
        if (featureGroup.classIndex) {
            assert.equal(numFeatures, featureGroup.classIndex.length);
        }
        if (featureGroup.typeIndex) {
            assert.equal(numFeatures, featureGroup.typeIndex.length);
        }
    }

    function checkPolygonFeatureGroup(featureGroup: PolygonFeatureGroup) {
        const numFeatures = featureGroup.numFeatures;
        checkFeatureGroup(featureGroup);

        assert.equal(numFeatures, (featureGroup as PolygonFeatureGroup).outerRingStartIndex.length);
    }

    function checkFeatureGroups(tileInfo: ExtendedTileInfo) {
        checkFeatureGroup(tileInfo.pointGroup);
        checkFeatureGroup(tileInfo.lineGroup);
        checkPolygonFeatureGroup(tileInfo.polygonGroup);
    }

    it("create ExtendedTileInfoWriter", function() {
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        writer.finish();

        assert.equal(tileInfo, writer.tileInfo);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 0);
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter#addPointInfo", function() {
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, env } = createPointInfo(123);

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.pointGroup,
            env,
            1234,
            "name",
            techniqueIndex,
            FeatureGroupType.Point
        );

        writer.addFeaturePoint(tileInfo.pointGroup, 5, 6);

        writer.finish();

        assert.exists(tileInfo.polygonGroup);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 1);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 0);
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter access pointInfo", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);
        const { technique, storedTechnique, env } = createPointInfo(3456);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.pointGroup,
            env,
            3456,
            "point_label-3456",
            techniqueIndex,
            FeatureGroupType.Point
        );

        writer.addFeaturePoint(tileInfo.pointGroup, 5, 6);

        writer.finish();

        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        const numPointsFound = tileAccessor.visitFeature(3456, tileHandler);

        // Assert
        assert.equal(numPointsFound, 1);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 1);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 0);

        assert.equal(tileHandler.lastValues.featureId, 3456);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            storedTechnique
        );
        assert.equal(tileHandler.lastValues.x, 5);
        assert.equal(tileHandler.lastValues.y, 6);
        assert.equal(tileInfo.textCatalog[tileHandler.lastValues.label], "point_label-3456");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(
                tileInfo.layerCatalog[tileHandler.lastValues.layerName],
                "point_layer-3456"
            );
            assert.equal(
                tileInfo.classCatalog[tileHandler.lastValues.className],
                "point_class-3456"
            );
            assert.equal(tileInfo.typeCatalog[tileHandler.lastValues.typeName], "point_type-3456");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter access multiple pointInfo", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);
        const { technique, storedTechnique, env } = createPointInfo(3456);
        const pointInfo2 = createPointInfo(7890);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.pointGroup,
            env,
            3456,
            "point_label-3456",
            techniqueIndex,
            FeatureGroupType.Point
        );

        writer.addFeaturePoint(tileInfo.pointGroup, 5, 6);

        const techniqueIndex2 = writer.addTechnique(pointInfo2.technique);

        writer.addFeature(
            tileInfo.pointGroup,
            pointInfo2.env,
            7890,
            "point_label-7890",
            techniqueIndex2,
            FeatureGroupType.Point
        );

        writer.addFeaturePoint(tileInfo.pointGroup, 8, 9);

        writer.finish();

        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        tileAccessor.visitAll(tileHandler);

        // Assert
        assert.equal(tileHandler.results.length, 2);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 2);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 0);

        assert.equal(tileHandler.results[0].featureId, 3456);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.results[0].techniqueIndex],
            storedTechnique
        );
        assert.equal(tileHandler.results[0].x, 5);
        assert.equal(tileHandler.results[0].y, 6);
        assert.equal(tileInfo.textCatalog[tileHandler.results[0].label], "point_label-3456");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(
                tileInfo.layerCatalog[tileHandler.results[0].layerName],
                "point_layer-3456"
            );
            assert.equal(
                tileInfo.classCatalog[tileHandler.results[0].className],
                "point_class-3456"
            );
            assert.equal(tileInfo.typeCatalog[tileHandler.results[0].typeName], "point_type-3456");
        }

        assert.equal(tileHandler.lastValues.featureId, 7890);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            pointInfo2.storedTechnique
        );
        assert.equal(tileHandler.lastValues.x, 8);
        assert.equal(tileHandler.lastValues.y, 9);
        assert.equal(tileInfo.textCatalog[tileHandler.lastValues.label], "point_label-7890");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(
                tileInfo.layerCatalog[tileHandler.lastValues.layerName],
                "point_layer-7890"
            );
            assert.equal(
                tileInfo.classCatalog[tileHandler.lastValues.className],
                "point_class-7890"
            );
            assert.equal(tileInfo.typeCatalog[tileHandler.lastValues.typeName], "point_type-7890");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter store and access lineInfo", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, storedTechnique, env } = createLineInfo(123);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.lineGroup,
            env,
            678,
            "lineLabel-123",
            techniqueIndex,
            FeatureGroupType.Line
        );

        writer.addFeaturePoints(tileInfo.lineGroup, [10, 11, 12, 13]);

        writer.finish();

        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        const numLinesFound = tileAccessor.visitFeature(678, tileHandler);

        // Assert
        assert.equal(numLinesFound, 1);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 1);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 0);

        assert.equal(tileHandler.lastValues.featureId, 678);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            storedTechnique
        );
        assert.deepEqual(tileHandler.lastValues.points, [10, 11, 12, 13]);
        assert.equal(tileInfo.textCatalog[tileHandler.lastValues.label], "lineLabel-123");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[tileHandler.lastValues.layerName], "line_layer-123");
            assert.equal(tileInfo.classCatalog[tileHandler.lastValues.className], "line_class-123");
            assert.equal(tileInfo.typeCatalog[tileHandler.lastValues.typeName], "line_type-123");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter store and access multiple lineInfos", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, env } = createLineInfo(123);

        const lineInfo2 = createLineInfo(456);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.lineGroup,
            env,
            678,
            "lineLabel-123",
            techniqueIndex,
            FeatureGroupType.Line
        );

        writer.addFeaturePoints(tileInfo.lineGroup, [10, 11, 12, 13]);

        const techniqueIndex2 = writer.addTechnique(lineInfo2.technique);

        writer.addFeature(
            tileInfo.lineGroup,
            lineInfo2.env,
            7890,
            "lineLabel-456",
            techniqueIndex2,
            FeatureGroupType.Line
        );

        writer.addFeaturePoints(tileInfo.lineGroup, [20, 21, 22, 23]);

        writer.finish();

        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        tileAccessor.visitAll(tileHandler);

        // Assert
        assert.equal(tileHandler.results.length, 2);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 2);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 0);

        assert.equal(tileHandler.results[0].featureId, 678);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            lineInfo2.storedTechnique
        );
        assert.equal(tileHandler.results[0].pointsStart, 0);
        assert.equal(tileHandler.results[0].numPointValues, 4);
        checkLinePoints(tileHandler.results[0], [10, 11, 12, 13]);

        assert.equal(tileInfo.textCatalog[tileHandler.results[0].label], "lineLabel-123");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[tileHandler.results[0].layerName], "line_layer-123");
            assert.equal(tileInfo.classCatalog[tileHandler.results[0].className], "line_class-123");
            assert.equal(tileInfo.typeCatalog[tileHandler.results[0].typeName], "line_type-123");
        }

        assert.equal(tileHandler.results[1].featureId, 7890);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.results[1].techniqueIndex],
            lineInfo2.storedTechnique
        );

        checkLinePoints(tileHandler.results[1], [20, 21, 22, 23]);
        assert.equal(tileInfo.textCatalog[tileHandler.results[1].label], "lineLabel-456");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[tileHandler.results[1].layerName], "line_layer-456");
            assert.equal(tileInfo.classCatalog[tileHandler.results[1].className], "line_class-456");
            assert.equal(tileInfo.typeCatalog[tileHandler.results[1].typeName], "line_type-456");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter store and access polygonInfo", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, storedTechnique, env } = createPolygonInfo(123);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            env,
            678,
            "fillLabel-123",
            techniqueIndex,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [10, 11, 12, 13, 14, 15], true);

        writer.finish();

        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        // console.log("=======\ntileInfo\n", JSON.stringify(tileInfo, undefined, 4));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        const numPolygonsFound = tileAccessor.visitFeature(678, tileHandler);

        // Assert
        assert.equal(numPolygonsFound, 1);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 1);

        assert.equal(tileHandler.lastValues.featureId, 678);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.lastValues.rings);
        if (tileHandler.lastValues.rings) {
            assert.equal(tileHandler.lastValues.rings.length, 1);
            assert.equal(tileHandler.lastValues.rings[0].isOuter, true);
            assert.deepEqual(tileHandler.lastValues.rings[0].contour, [10, 11, 12, 13, 14, 15]);
        }
        assert.equal(tileInfo.textCatalog[tileHandler.lastValues.label], "fillLabel-123");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[tileHandler.lastValues.layerName], "fill_layer-123");
            assert.equal(tileInfo.classCatalog[tileHandler.lastValues.className], "fill_class-123");
            assert.equal(tileInfo.typeCatalog[tileHandler.lastValues.typeName], "fill_type-123");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter store and access multiple polygonInfos-1", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, storedTechnique, env } = createPolygonInfo(123);
        const polygonInfo2 = createPolygonInfo(999);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            env,
            678,
            "fillLabel-123",
            techniqueIndex,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [10, 11, 12, 13, 14, 15], true);

        const techniqueIndex2 = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            polygonInfo2.env,
            999,
            "fillLabel-999",
            techniqueIndex2,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [125, 135, 145, 155, 165, 175, 185, 195], true);

        writer.finish();
        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        tileAccessor.visitAll(tileHandler);

        // Assert
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 2);

        assert.equal(tileHandler.results[0].featureId, 678);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.results[0].techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.results[0].rings);
        const results0 = tileHandler.results[0];
        if (results0 && results0.rings) {
            assert.equal(results0.rings.length, 1);
            assert.equal(results0.rings[0].isOuter, true);
            assert.deepEqual(results0.rings[0].contour, [10, 11, 12, 13, 14, 15]);
        }
        assert.equal(tileInfo.textCatalog[results0.label], "fillLabel-123");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[results0.layerName], "fill_layer-123");
            assert.equal(tileInfo.classCatalog[results0.className], "fill_class-123");
            assert.equal(tileInfo.typeCatalog[results0.typeName], "fill_type-123");
        }

        assert.equal(tileHandler.results[1].featureId, 999);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.results[1].rings);
        const results1 = tileHandler.results[1];
        if (results1 && results1.rings) {
            assert.equal(results1.rings.length, 1);
            assert.equal(results1.rings[0].isOuter, true);
            assert.deepEqual(results1.rings[0].contour, [125, 135, 145, 155, 165, 175, 185, 195]);
        }
        assert.equal(tileInfo.textCatalog[results1.label], "fillLabel-999");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[results1.layerName], "fill_layer-999");
            assert.equal(tileInfo.classCatalog[results1.className], "fill_class-999");
            assert.equal(tileInfo.typeCatalog[results1.typeName], "fill_type-999");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter store and access multiple polygonInfos-2", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, storedTechnique, env } = createPolygonInfo(123);
        const polygonInfo2 = createPolygonInfo(999);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            env,
            678,
            "fillLabel-123",
            techniqueIndex,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [10, 11, 12, 13, 14, 15], true);
        writer.addRingPoints(tileInfo.polygonGroup, [50, 51, 52, 53, 54, 55, 56, 57], false);

        const techniqueIndex2 = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            polygonInfo2.env,
            999,
            "fillLabel-999",
            techniqueIndex2,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [125, 135, 145, 155, 165, 175, 185, 195], true);

        writer.finish();
        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        tileAccessor.visitAll(tileHandler);

        // Assert
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 2);

        assert.equal(tileHandler.results[0].featureId, 678);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.results[0].techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.results[0].rings);
        const results0 = tileHandler.results[0];
        if (results0 && results0.rings) {
            assert.equal(results0.rings.length, 2);
            assert.equal(results0.rings[0].isOuter, true);
            assert.deepEqual(results0.rings[0].contour, [10, 11, 12, 13, 14, 15]);
            assert.equal(results0.rings[1].isOuter, false);
            assert.deepEqual(results0.rings[1].contour, [50, 51, 52, 53, 54, 55, 56, 57]);
        }
        assert.equal(tileInfo.textCatalog[results0.label], "fillLabel-123");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[results0.layerName], "fill_layer-123");
            assert.equal(tileInfo.classCatalog[results0.className], "fill_class-123");
            assert.equal(tileInfo.typeCatalog[results0.typeName], "fill_type-123");
        }

        assert.equal(tileHandler.results[1].featureId, 999);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.results[1].rings);
        const results1 = tileHandler.results[1];
        if (results1 && results1.rings) {
            assert.equal(results1.rings.length, 1);
            assert.equal(results1.rings[0].isOuter, true);
            assert.deepEqual(results1.rings[0].contour, [125, 135, 145, 155, 165, 175, 185, 195]);
        }
        assert.equal(tileInfo.textCatalog[results1.label], "fillLabel-999");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[results1.layerName], "fill_layer-999");
            assert.equal(tileInfo.classCatalog[results1.className], "fill_class-999");
            assert.equal(tileInfo.typeCatalog[results1.typeName], "fill_type-999");
        }
        checkFeatureGroups(tileInfo);
    });

    it("ExtendedTileInfoWriter store and access multiple polygonInfos-3", function() {
        // Arrange
        const tileInfo = new ExtendedTileInfo(tileKey, true);
        const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

        const { technique, storedTechnique, env } = createPolygonInfo(123);
        const polygonInfo2 = createPolygonInfo(999);

        const tileHandler = new TileHandler();

        const techniqueIndex = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            env,
            678,
            "fillLabel-123",
            techniqueIndex,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [10, 11, 12, 13, 14, 15], true);
        writer.addRingPoints(tileInfo.polygonGroup, [50, 51, 52, 53, 54, 55, 56, 57], false);
        writer.addRingPoints(tileInfo.polygonGroup, [60, 61, 62, 63, 64, 65], true);

        const techniqueIndex2 = writer.addTechnique(technique);

        writer.addFeature(
            tileInfo.polygonGroup,
            polygonInfo2.env,
            999,
            "fillLabel-999",
            techniqueIndex2,
            FeatureGroupType.Polygon
        );

        writer.addRingPoints(tileInfo.polygonGroup, [125, 135, 145, 155, 165, 175, 185, 195], true);

        writer.finish();
        assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

        const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

        // Act
        tileAccessor.visitAll(tileHandler);

        // Assert
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.pointGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.lineGroup), 0);
        assert.equal(ExtendedTileInfo.featureGroupSize(tileInfo.polygonGroup), 2);

        assert.equal(tileHandler.results[0].featureId, 678);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.lastValues.techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.results[0].rings);
        const results0 = tileHandler.results[0];
        if (results0 && results0.rings) {
            assert.equal(results0.rings.length, 3);
            assert.equal(results0.rings[0].isOuter, true);
            assert.deepEqual(results0.rings[0].contour, [10, 11, 12, 13, 14, 15]);
            assert.equal(results0.rings[1].isOuter, false);
            assert.deepEqual(results0.rings[1].contour, [50, 51, 52, 53, 54, 55, 56, 57]);
            assert.equal(results0.rings[2].isOuter, true);
            assert.deepEqual(results0.rings[2].contour, [60, 61, 62, 63, 64, 65]);
        }
        assert.equal(tileInfo.textCatalog[results0.label], "fillLabel-123");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[results0.layerName], "fill_layer-123");
            assert.equal(tileInfo.classCatalog[results0.className], "fill_class-123");
            assert.equal(tileInfo.typeCatalog[results0.typeName], "fill_type-123");
        }

        assert.equal(tileHandler.results[1].featureId, 999);
        assert.deepEqual(
            tileInfo.techniqueCatalog[tileHandler.results[1].techniqueIndex],
            storedTechnique
        );

        assert.exists(tileHandler.results[1].rings);
        const results1 = tileHandler.results[1];
        if (results1 && results1.rings) {
            assert.equal(results1.rings.length, 1);
            assert.equal(results1.rings[0].isOuter, true);
            assert.deepEqual(results1.rings[0].contour, [125, 135, 145, 155, 165, 175, 185, 195]);
        }
        assert.equal(tileInfo.textCatalog[results1.label], "fillLabel-999");
        assert.isDefined(tileInfo.layerCatalog);
        assert.isDefined(tileInfo.classCatalog);
        assert.isDefined(tileInfo.typeCatalog);
        if (tileInfo.layerCatalog && tileInfo.classCatalog && tileInfo.typeCatalog) {
            assert.equal(tileInfo.layerCatalog[results1.layerName], "fill_layer-999");
            assert.equal(tileInfo.classCatalog[results1.className], "fill_class-999");
            assert.equal(tileInfo.typeCatalog[results1.typeName], "fill_type-999");
        }
        checkFeatureGroups(tileInfo);
    });

    // function addManyPolygonInfos(
    //     numInfos: number,
    //     numRings: number = 10,
    //     contourLength: number = 50
    // ): {
    //     tileInfo: ExtendedTileInfo;
    //     time: number;
    // } {
    //     const startTime = PerformanceTimer.now();
    //     // high number of repeats to average results properly
    //     const numRepeat = 100 /* better: 100 */;

    //     let tileInfo = new ExtendedTileInfo(tileKey, true);

    //     for (let repeat = 0; repeat < numRepeat; repeat++) {
    //         tileInfo = new ExtendedTileInfo(tileKey, true);
    //         const writer = new ExtendedTileInfoWriter(tileInfo, /*storeExtendedTags*/ true);

    //         const { technique, env } = createPolygonInfo(0);

    //         const techniqueIndex = writer.addTechnique(technique);

    //         const contour = new Array<number>();
    //         for (let i = 0; i < contourLength; i++) {
    //             contour.push(i);
    //         }

    //         for (let i = 0; i < numInfos; i++) {
    //             writer.addFeature(
    //                 tileInfo.polygonGroup,
    //                 technique,
    //                 env,
    //                 100000 + i,
    //                 techniqueIndex,
    //                 /* isPolygonGroup */ true
    //             );

    //             for (let j = 0; j < numRings; j++) {
    //                 writer.addRingPoints(tileInfo.polygonGroup, contour, true);
    //             }
    //         }
    //         writer.finish();
    //     }

    //     const endTime = PerformanceTimer.now();

    //     return {
    //         tileInfo,
    //         time: (endTime - startTime) / numRepeat
    //     };
    // }

    // function visitAllPolygonInfos(
    //     tileVisitor: ExtendedTileInfoHandler,
    //     tileInfo: ExtendedTileInfo
    // ): number {
    //     const startTime = PerformanceTimer.now();

    //     assert.isTrue(ExtendedTileInfo.tileInfoFinished(tileInfo));

    //     const tileAccessor = new ExtendedTileInfoVisitor(tileInfo);

    //     const numRepeat = 3;

    //     for (let repeat = 0; repeat < numRepeat; repeat++) {
    //         tileAccessor.visitAll(tileVisitor);
    //     }
    //     const endTime = PerformanceTimer.now();

    //     return (endTime - startTime) / numRepeat;
    // }

    // function createAndVisitManyPolygonInfos(
    //     tileVisitor: ExtendedTileInfoHandler,
    //     numInfos: number,
    //     numRings: number = 10,
    //     contourLength: number = 50
    // ) {
    //     const create = addManyPolygonInfos(numInfos, numRings, contourLength);
    //     const visitTime = visitAllPolygonInfos(tileVisitor, create.tileInfo);
    //     logger.log(
    //         `time create (${numInfos}, ${numRings}, ${contourLength}) ${
    //             create.time
    //         }ms, time visit ${visitTime.toFixed(2)}ms`
    //     );
    // }

    // it("ExtendedTileInfoWriter measure store polygonInfos - NullTileVisitor", function() {
    //     const tileVisitor = new NullTileHandler();
    //     createAndVisitManyPolygonInfos(tileVisitor, 1000, 10, 25);
    //     createAndVisitManyPolygonInfos(tileVisitor, 5000, 2, 200);
    //     createAndVisitManyPolygonInfos(tileVisitor, 5000, 5, 25);
    // }).timeout(0);

    // it("ExtendedTileInfoWriter measure store polygonInfos - Copying TileVisitor", function() {
    //     const tileVisitor = new TileHandler();
    //     createAndVisitManyPolygonInfos(tileVisitor, 1000, 10, 25);
    //     createAndVisitManyPolygonInfos(tileVisitor, 5000, 2, 200);
    //     createAndVisitManyPolygonInfos(tileVisitor, 5000, 5, 25);
    // }).timeout(0);
});
