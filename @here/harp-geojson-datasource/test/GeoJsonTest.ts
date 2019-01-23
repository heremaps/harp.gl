/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeometryType, StyleSet, StyleSetEvaluator } from "@here/harp-datasource-protocol";
import {
    Projection,
    TileKey,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { DataProvider, TileDataSource, TileFactory } from "@here/harp-mapview-decoder";
import { assert } from "chai";
import { GeoJson } from "../lib/GeoJsonDataType";
import { GeoJsonTileDecoder } from "../lib/GeoJsonDecoder";
import { GeoJsonTile } from "../lib/GeoJsonTile";
import { Flattener } from "./../lib/utils/Flattener";

const TEST_JSON: GeoJson = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [10, 20] // Random coordinates.
            },
            properties: {
                name: "blabla"
            }
        },
        {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [[1, 2], [3, 4]]
            },
            properties: {
                name: "blablabla"
            }
        },
        {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [[1, 0], [3, 4], [5, 0]], // Main shape.
                    [[2, 1], [3, 2], [4, 1]] // Hole to test hole support.
                ]
            },
            properties: {
                name: "blablablabla"
            }
        }
    ]
};

describe("@here-geojson-datasource", () => {
    it("flattens JSON-like objects", () => {
        const jsonLike = {
            number: 0,
            boolean: false,
            string: "fre",
            null: null,
            nested: {
                a: null,
                b: {
                    c: "foo",
                    d: [34]
                }
            },
            array: [
                32,
                {
                    a: "foo",
                    b: [120]
                },
                ["bar"]
            ]
        };

        const result = Flattener.flatten(jsonLike, "properties");

        assert.equal(result["properties.number"], 0);
        assert.equal(result["properties.boolean"], false);
        assert.equal(result["properties.string"], "fre");
        assert.equal(result["properties.null"], null);
        assert.equal(result["properties.nested.a"], null);
        assert.equal(result["properties.nested.b.c"], "foo");
        assert.equal(result["properties.nested.b.d[0]"], 34);
        assert.equal(result["properties.array[0]"], 32);
        assert.equal(result["properties.array[1].a"], "foo");
        assert.equal(result["properties.array[1].b[0]"], 120);
        assert.equal(result["properties.array[2][0]"], "bar");
    });

    it("tests GeoJsonDecoder geometry generation", async () => {
        const styleSet: StyleSet = [
            {
                when: "type == 'point'",
                technique: "circles"
            },
            {
                when: "type == 'point'",
                technique: "text",
                labelProperty: "name"
            },
            {
                when: "type == 'line'",
                technique: "solid-line"
            },
            {
                when: "type == 'polygon'",
                technique: "fill"
            }
        ];
        const decodedTile = await getDecodedTile(styleSet);

        // Point feature support.
        const pointBuffer = decodedTile.geometries.find(o => o.type === GeometryType.Point)!
            .vertexAttributes[0].buffer;
        const pointCoords = new Float32Array(pointBuffer);
        const pointCoordsArray: number[] = [];
        pointCoords.forEach((value, index) => {
            pointCoordsArray[index] = value;
        });
        assert.deepEqual(pointCoordsArray, [19272186, -20432022, 0]);

        // Line feature support.
        const lineBuffer = decodedTile.geometries.find(o => o.type === GeometryType.SolidLine)!
            .vertexAttributes[0].buffer;
        const lineCoords = new Float32Array(lineBuffer);
        const lineCoordsArray: number[] = [];
        lineCoords.forEach((value, index) => {
            lineCoordsArray[index] = value;
        });
        assert.deepEqual(lineCoordsArray, [18270312, -18381676, 18492950, -18604632]);

        // Polygon feature support.
        const polygonGeometry = decodedTile.geometries.find(o => o.type === GeometryType.Polygon)!;
        const polygonVertexBuffer = polygonGeometry.vertexAttributes[0].buffer;
        const polygonCoords = new Float32Array(polygonVertexBuffer);
        const polygonCoordsArray: number[] = [];
        polygonCoords.forEach((value, index) => {
            polygonCoordsArray[index] = value;
        });
        const polygonIndexBuffer = polygonGeometry.index!.buffer;
        const polygonIndices = new Uint32Array(polygonIndexBuffer);
        const polygonIndicesArray: number[] = [];
        polygonIndices.forEach((value, index) => {
            polygonIndicesArray[index] = value;
        });
        assert.deepEqual(polygonCoordsArray, [
            18270312,
            -18158992,
            0,
            18492950,
            -18604632,
            0,
            18715590,
            -18158992,
            0,
            18381630,
            -18270318,
            0,
            18492950,
            -18381676,
            0,
            18604270,
            -18270318,
            0
        ]);
        // Checks that the hole in the polygon is supported.
        assert.deepEqual(polygonIndicesArray, [
            2,
            0,
            3,
            4,
            3,
            0,
            2,
            3,
            5,
            4,
            0,
            1,
            1,
            2,
            5,
            5,
            4,
            1
        ]);
    });

    it("tests GeoJsonTile text generation", async () => {
        class FakeDataProvider implements DataProvider {
            ready(): boolean {
                return true;
            }
            // tslint:disable-next-line:no-empty
            async connect(): Promise<void> {}
            async getTile(): Promise<{}> {
                return TEST_JSON;
            }
        }
        class FakeGeoJsonDataSource extends TileDataSource<GeoJsonTile> {
            constructor(tileDecoder: GeoJsonTileDecoder) {
                super(new TileFactory(GeoJsonTile), {
                    decoder: tileDecoder,
                    styleSetName: "geojson",
                    tilingScheme: webMercatorTilingScheme,
                    dataProvider: new FakeDataProvider()
                });
            }
        }
        class FakeGeoJsonTile extends GeoJsonTile {
            get projection(): Projection {
                return webMercatorProjection;
            }
        }
        const styleSet: StyleSet = [
            {
                when: "type == 'point'",
                technique: "text",
                labelProperty: "name"
            },
            {
                when: "type == 'line'",
                technique: "text",
                labelProperty: "name"
            },
            {
                when: "type == 'polygon'",
                technique: "text",
                labelProperty: "name"
            }
        ];
        const decoder = new GeoJsonTileDecoder();
        const decodedTile = await getDecodedTile(styleSet);
        const tile = new FakeGeoJsonTile(new FakeGeoJsonDataSource(decoder), new TileKey(1, 1, 5));
        tile.createTextElements(decodedTile);
        const userTextElements = tile.userTextElements;

        // Text element for points.
        const text0Coords = userTextElements[0].points as THREE.Vector2;
        const result0 = {
            x: text0Coords.x,
            y: text0Coords.y,
            text: userTextElements[0].text
        };
        const expectedResult0 = {
            text: "blabla",
            x: 19272186,
            y: -20432022
        };
        assert.deepEqual(result0, expectedResult0);

        // Text paths for lines.
        const text3Coords = userTextElements[2].points as THREE.Vector2[];
        const result3 = {
            x1: text3Coords[0].x,
            y1: text3Coords[0].y,
            x2: text3Coords[1].x,
            y2: text3Coords[1].y,
            text: userTextElements[2].text
        };
        const expectedResult3 = {
            text: "blablabla",
            x1: 18270311.426446024,
            y1: -18381676.144158296,
            x2: 18492950.40803257,
            y2: -18604632.045308776
        };
        assert.deepEqual(result3, expectedResult3);

        // Texts for polygons.
        const text2Coords = userTextElements[1].points as THREE.Vector2;
        const result2 = {
            x: text2Coords.x,
            y: text2Coords.y,
            text: userTextElements[1].text
        };
        const expectedResult2 = {
            text: "blablablabla",
            x: 18492950,
            y: -18307488
        };
        assert.deepEqual(result2, expectedResult2);
    });
});

async function getDecodedTile(styleSet: StyleSet) {
    const styleSetEvaluator = new StyleSetEvaluator(styleSet);

    return new GeoJsonTileDecoder().decodeThemedTile(
        TEST_JSON,
        new TileKey(1, 1, 5), // Random tile.
        styleSetEvaluator,
        webMercatorProjection
    );
}
