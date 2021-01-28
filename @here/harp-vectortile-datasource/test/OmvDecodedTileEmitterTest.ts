/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    Geometry,
    GeometryType,
    isStandardTechnique,
    StyleSet,
    TextureCoordinateType
} from "@here/harp-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import {
    GeoCoordinates,
    mercatorProjection,
    TileKey,
    Vector3Like,
    webMercatorProjection
} from "@here/harp-geoutils";
import { assert } from "chai";
import { Vector2, Vector3 } from "three";

import { DecodeInfo } from "../lib/DecodeInfo";
import { IPolygonGeometry } from "../lib/IGeometryProcessor";
import { world2tile } from "../lib/OmvUtils";
import { VectorTileDataEmitter } from "../lib/VectorTileDataEmitter";

class OmvDecodedTileEmitterTest extends VectorTileDataEmitter {
    splitJaggyLinesTest(
        lines: number[][],
        minEstimatedLabelLengthSqr: number,
        maxCornerAngle: number
    ): number[][] {
        return this.splitJaggyLines(lines, minEstimatedLabelLengthSqr, maxCornerAngle);
    }
}

const extents = 4096;
const layer = "dummy";

describe("OmvDecodedTileEmitter", function () {
    function createTileEmitter(
        decodeInfo: DecodeInfo = new DecodeInfo(
            "test",
            mercatorProjection,
            TileKey.fromRowColumnLevel(0, 0, 1)
        ),
        styleSet: StyleSet = [
            {
                when: "layer == 'mock-layer'",
                technique: "standard",
                attr: {
                    textureCoordinateType: TextureCoordinateType.TileSpace
                }
            }
        ]
    ): {
        tileEmitter: OmvDecodedTileEmitterTest;
        styleSetEvaluator: StyleSetEvaluator;
    } {
        const styleSetEvaluator = new StyleSetEvaluator({ styleSet });

        const tileEmitter = new OmvDecodedTileEmitterTest(
            decodeInfo,
            styleSetEvaluator,
            false,
            false,
            false
        );

        return { tileEmitter, styleSetEvaluator };
    }

    function checkVertexAttribute(
        geometry: Geometry,
        index: number,
        name: string,
        expectedCount: number,
        type: string = "float"
    ): Float32Array {
        const attribute = geometry.vertexAttributes![index];
        assert.equal(attribute.name, name, `geometry has ${name} attribute`);
        assert.equal(attribute.type, type, `${name} is ${type}`);

        const buffer = new Float32Array(attribute.buffer);
        const count = buffer.length / attribute.itemCount;
        assert.equal(count, expectedCount);

        return buffer;
    }

    function tileGeoBoxToPolygonGeometry(decodeInfo: DecodeInfo): IPolygonGeometry[] {
        const geoBox = decodeInfo.geoBox;
        const coordinates: GeoCoordinates[] = [
            new GeoCoordinates(geoBox.south, geoBox.west),
            new GeoCoordinates(geoBox.south, geoBox.east),
            new GeoCoordinates(geoBox.north, geoBox.east),
            new GeoCoordinates(geoBox.north, geoBox.west)
        ];

        const tileLocalCoords = coordinates.map(p => {
            const projected = webMercatorProjection.projectPoint(p, new Vector3());
            const result = new Vector2();
            const tileCoords = world2tile(extents, decodeInfo, projected, false, result);
            return tileCoords;
        });

        return [{ rings: [tileLocalCoords] }];
    }

    for (const { level, constantHeight, expectScaledHeight } of [
        { level: 12, constantHeight: undefined, expectScaledHeight: true },
        { level: 10, constantHeight: undefined, expectScaledHeight: false },
        { level: 12, constantHeight: true, expectScaledHeight: false },
        { level: 10, constantHeight: false, expectScaledHeight: true }
    ]) {
        const result = expectScaledHeight ? "scaled" : "not scaled";
        const tileKey = TileKey.fromRowColumnLevel(0, 0, level);
        const decodeInfo = new DecodeInfo("test", mercatorProjection, tileKey);

        function getExpectedHeight(geoAltitude: number, worldCoords: Vector3Like) {
            const scaleFactor = expectScaledHeight
                ? decodeInfo.targetProjection.getScaleFactor(worldCoords)
                : 1.0;
            // Force conversion to single precision as in decoder so that results match.
            return new Float32Array([geoAltitude * scaleFactor])[0];
        }

        it(`Point Height at level ${level} with constantHeight ${constantHeight} is ${result}`, function () {
            const geoCoords = decodeInfo.geoBox.center.clone();
            geoCoords.altitude = 100;
            const tileLocalCoords = world2tile(
                extents,
                decodeInfo,
                webMercatorProjection.projectPoint(geoCoords),
                false,
                new Vector3()
            );
            const worldCoords = decodeInfo.targetProjection.projectPoint(geoCoords);

            const { tileEmitter, styleSetEvaluator } = createTileEmitter(decodeInfo, [
                {
                    when: "1",
                    technique: "text",
                    attr: { text: "Test", constantHeight }
                }
            ]);

            const mockContext = {
                env: new MapEnv({ layer }),
                storageLevel: tileKey.level,
                zoomLevel: tileKey.level
            };

            tileEmitter.processPointFeature(
                layer,
                extents,
                [tileLocalCoords],
                mockContext,
                styleSetEvaluator.getMatchingTechniques(mockContext.env)
            );

            const { textGeometries } = tileEmitter.getDecodedTile();

            assert.equal(textGeometries?.length, 1, "only one geometry created");

            const buffer = new Float32Array(textGeometries![0].positions.buffer);
            assert.equal(buffer.length, 3, "one position (3 coordinates)");

            const actualHeight = buffer[2];
            assert.equal(actualHeight, getExpectedHeight(geoCoords.altitude, worldCoords));
        });

        it(`Extruded polygon height at level ${level} with constantHeight ${constantHeight} is ${result}`, function () {
            const polygons = tileGeoBoxToPolygonGeometry(decodeInfo);
            const height = 100;
            const { tileEmitter, styleSetEvaluator } = createTileEmitter(decodeInfo, [
                {
                    when: "1",
                    technique: "extruded-polygon",
                    attr: {
                        textureCoordinateType: TextureCoordinateType.TileSpace,
                        height,
                        constantHeight
                    }
                }
            ]);

            const mockContext = {
                env: new MapEnv({ layer }),
                storageLevel: level,
                zoomLevel: level
            };

            tileEmitter.processPolygonFeature(
                layer,
                extents,
                polygons,
                mockContext,
                styleSetEvaluator.getMatchingTechniques(mockContext.env),
                undefined
            );

            const decodedTile = tileEmitter.getDecodedTile();

            const { geometries } = decodedTile;

            assert.equal(geometries.length, 1, "only one geometry created");
            assert.equal(geometries[0].type, GeometryType.ExtrudedPolygon, "geometry is a polygon");
            const geometry = geometries[0];
            const posAttr = geometry.vertexAttributes![0];
            const array = new Float32Array(posAttr.buffer);

            const vertexCount = 8;
            assert.equal(array.length / posAttr.itemCount, vertexCount);

            const worldVertices = [];
            for (let i = 0; i < array.length; i += posAttr.itemCount) {
                worldVertices.push(new Vector3().fromArray(array, i).add(decodeInfo.center));
            }
            worldVertices.sort((vl, vr) => vl.z - vr.z); // sort by height.
            // First half must have 0 height
            worldVertices.slice(0, vertexCount / 2).forEach(v => assert.equal(v.z, 0));

            // Second half must have expected height
            worldVertices
                .slice(vertexCount / 2)
                .forEach(v => assert.equal(v.z, getExpectedHeight(height, v)));
        });
    }

    it("Ring data conversion to polygon data: whole tile square shape", function () {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 1);
        const projection = mercatorProjection;

        const decodeInfo = new DecodeInfo("test", projection, tileKey);
        const polygons = tileGeoBoxToPolygonGeometry(decodeInfo);

        const { tileEmitter, styleSetEvaluator } = createTileEmitter(decodeInfo);

        const storageLevel = 10;
        const mockContext = {
            env: new MapEnv({ layer: "mock-layer" }),
            storageLevel,
            zoomLevel: storageLevel
        };

        const matchedTechniques = styleSetEvaluator.getMatchingTechniques(mockContext.env);
        tileEmitter.processPolygonFeature(
            "mock-layer",
            4096,
            polygons,
            mockContext,
            matchedTechniques,
            undefined
        );

        const decodedTile = tileEmitter.getDecodedTile();

        const { techniques, geometries } = decodedTile;

        assert.equal(techniques.length, 1, "only one technique created");
        assert.equal(
            isStandardTechnique(techniques[0]),
            true,
            "created technique is standard technique"
        );
        assert.equal(geometries.length, 1, "only one geometry created");
        assert.equal(geometries[0].type, GeometryType.Polygon, "geometry is a polygon");
        assert.equal(
            geometries[0].vertexAttributes?.length,
            2,
            "number of attributes is as expected"
        );

        const firstGeometry = geometries[0];
        const vertexCount = 5;
        checkVertexAttribute(firstGeometry, 0, "position", vertexCount);
        const texCoords = checkVertexAttribute(firstGeometry, 1, "uv", vertexCount);

        const eps = 1e-15;
        assert.closeTo(texCoords[0], 0, eps);
        assert.closeTo(texCoords[1], 0, eps);

        assert.closeTo(texCoords[2], 1, eps);
        assert.closeTo(texCoords[3], 0, eps);

        assert.closeTo(texCoords[4], 1, eps);
        assert.closeTo(texCoords[5], 1, eps);

        assert.closeTo(texCoords[6], 0, eps);
        assert.closeTo(texCoords[7], 1, eps);
    });

    it("Test splitJaggyLines for short paths", function () {
        const { tileEmitter } = createTileEmitter();

        const lines = [[0, 0, 0, 1, 1, 0]];

        const splitLines = tileEmitter.splitJaggyLinesTest(lines, 5, 10);
        assert.equal(splitLines.length, 0, "Line segment too short");
    });

    it("Test splitJaggyLines for multiple short paths", function () {
        const { tileEmitter } = createTileEmitter();

        const lines = [[0, 0, 0, 1, 0, 0, 1, 1, 0, 10, 10, 0, 20, 20, 0]];

        const splitLines = tileEmitter.splitJaggyLinesTest(lines, 25, Math.PI / 8);
        assert.equal(splitLines.length, 1, "One segment out of three segments is too short");
        assert.equal(splitLines[0].length, 9);
        assert.equal(splitLines[0][0], 1);
        assert.equal(splitLines[0][3], 10);
        assert.equal(splitLines[0][6], 20);
    });

    it("Test splitJaggyLines for path with sharp angle", function () {
        const { tileEmitter } = createTileEmitter();

        const lines = [[0, 0, 0, 10, 10, 0, 20, 0, 0]];

        const splitLines = tileEmitter.splitJaggyLinesTest(lines, 25, Math.PI / 8);
        assert.equal(
            splitLines.length,
            2,
            "One segment is split at sharp corner into two segments"
        );
        assert.equal(splitLines[0].length, 6);
        assert.equal(splitLines[1].length, 6);
        assert.equal(splitLines[0][0], 0);
        assert.equal(splitLines[0][3], 10);
        assert.equal(splitLines[1][0], 10);
        assert.equal(splitLines[1][3], 20);
    });
});
