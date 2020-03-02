/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
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
    webMercatorProjection
} from "@here/harp-geoutils";
import { assert } from "chai";
import { Vector2, Vector3 } from "three";
import { IPolygonGeometry } from "../lib/IGeometryProcessor";
import { OmvDecodedTileEmitter } from "../lib/OmvDecodedTileEmitter";
import { OmvDecoder } from "../lib/OmvDecoder";
import { world2tile } from "../lib/OmvUtils";

class OmvDecodedTileEmitterTest extends OmvDecodedTileEmitter {
    splitJaggyLinesTest(
        lines: number[][],
        minEstimatedLabelLengthSqr: number,
        maxCornerAngle: number
    ): number[][] {
        return this.splitJaggyLines(lines, minEstimatedLabelLengthSqr, maxCornerAngle);
    }
}

describe("OmvDecodedTileEmitter", function() {
    function createTileEmitter(): {
        tileEmitter: OmvDecodedTileEmitterTest;
        styleSetEvaluator: StyleSetEvaluator;
    } {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 1);
        const projection = mercatorProjection;
        const tileSizeOnScreen = 100;

        const decodeInfo = new OmvDecoder.DecodeInfo("test", projection, tileKey, tileSizeOnScreen);

        const styleSet: StyleSet = [
            {
                when: "1",
                technique: "standard",
                attr: {
                    textureCoordinateType: TextureCoordinateType.TileSpace
                }
            }
        ];

        const styleSetEvaluator = new StyleSetEvaluator(styleSet);

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

    it("Ring data conversion to polygon data: whole tile square shape", function() {
        const tileKey = TileKey.fromRowColumnLevel(0, 0, 1);
        const projection = mercatorProjection;
        const tileSizeOnScreen = 100;

        const decodeInfo = new OmvDecoder.DecodeInfo("test", projection, tileKey, tileSizeOnScreen);

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
            const tileCoords = world2tile(
                4096,
                decodeInfo,
                new Vector2(projected.x, projected.y),
                false,
                result
            );
            return tileCoords;
        });

        const polygons: IPolygonGeometry[] = [
            {
                rings: [tileLocalCoords]
            }
        ];

        const { tileEmitter, styleSetEvaluator } = createTileEmitter();

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
        const vertexCount = 4;
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

    it("Test splitJaggyLines for short paths", function() {
        const { tileEmitter } = createTileEmitter();

        const lines = [[0, 0, 0, 1, 1, 0]];

        const splitLines = tileEmitter.splitJaggyLinesTest(lines, 5, 10);
        assert.equal(splitLines.length, 0, "Line segment too short");
    });

    it("Test splitJaggyLines for multiple short paths", function() {
        const { tileEmitter } = createTileEmitter();

        const lines = [[0, 0, 0, 1, 0, 0, 1, 1, 0, 10, 10, 0, 20, 20, 0]];

        const splitLines = tileEmitter.splitJaggyLinesTest(lines, 25, Math.PI / 8);
        assert.equal(splitLines.length, 1, "One segment out of three segments is too short");
        assert.equal(splitLines[0].length, 9);
        assert.equal(splitLines[0][0], 1);
        assert.equal(splitLines[0][3], 10);
        assert.equal(splitLines[0][6], 20);
    });

    it("Test splitJaggyLines for path with sharp angle", function() {
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
