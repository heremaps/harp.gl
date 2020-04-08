/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";

import { GeoJson, GeometryType, StyleSet } from "@here/harp-datasource-protocol";
import { StyleSetEvaluator } from "@here/harp-datasource-protocol/index-decoder";
import {
    mercatorProjection,
    Projection,
    TileKey,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { ColorCache, MapView } from "@here/harp-mapview";
import { DataProvider, TileDataSource, TileFactory } from "@here/harp-mapview-decoder";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";

import { GeoJsonTileDecoder } from "../lib/GeoJsonDecoder";
import { GeoJsonTile } from "../lib/GeoJsonTile";
import { Flattener } from "./../lib/utils/Flattener";

declare const global: any;

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
                coordinates: [
                    [1, 2],
                    [3, 4]
                ]
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
                    [
                        [1, 0],
                        [3, 4],
                        [5, 0]
                    ], // Main shape.
                    [
                        [2, 1],
                        [3, 2],
                        [4, 1]
                    ] // Hole to test hole support.
                ]
            },
            properties: {
                name: "blablablabla"
            }
        }
    ]
};

describe("@here-geojson-datasource", () => {
    const inNodeContext = typeof window === "undefined";
    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    // tslint:disable-next-line:no-unused-variable
    let webGlStub: sinon.SinonStub;
    let mapView: MapView;
    beforeEach(function() {
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        webGlStub = sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = () => {};
        }
    });

    afterEach(function() {
        if (mapView !== undefined) {
            ColorCache.instance.clear();
            mapView.dispose();
        }
        sandbox.restore();
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.navigator;
        }
    });

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
            .vertexAttributes![0].buffer;
        const pointCoords = new Float32Array(pointBuffer);
        const pointCoordsArray: number[] = [];
        pointCoords.forEach((value, index) => {
            pointCoordsArray[index] = value;
        });
        assert.deepEqual(pointCoordsArray, [19272186, -15885961, 0]);

        // Line feature support.
        const lineBuffer = decodedTile.geometries.find(o => o.type === GeometryType.SolidLine)!
            .vertexAttributes![0].buffer;
        const lineCoords = new Float32Array(lineBuffer);
        const lineCoordsArray: number[] = [];
        lineCoords.forEach((value, index) => {
            lineCoordsArray[index] = value;
        });
        assert.deepEqual(lineCoordsArray, [18270312, -17936308, 0, 18492950, -17713352, 0]);

        // Polygon feature support.
        const polygonGeometry = decodedTile.geometries.find(o => o.type === GeometryType.Polygon)!;
        const polygonVertexBuffer = polygonGeometry.vertexAttributes![0].buffer;
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
            -17713352,
            0,
            18715590,
            -18158992,
            0,
            18381630,
            -18047666,
            0,
            18492950,
            -17936308,
            0,
            18604270,
            -18047666,
            0
        ]);
        // Checks that the hole in the polygon is supported.
        assert.deepEqual(polygonIndicesArray, [
            0,
            3,
            4,
            5,
            3,
            0,
            1,
            0,
            4,
            5,
            0,
            2,
            2,
            1,
            4,
            4,
            5,
            2
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
            /** @override */
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
        const datasource = new FakeGeoJsonDataSource(decoder);

        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = { window: { devicePixelRatio: 10 } };
            theGlobal.requestAnimationFrame = () => {};
        }

        const canvas = {
            clientWidth: 400,
            clientHeight: 300,
            addEventListener: () => {},
            removeEventListener: () => {}
        };
        mapView = new MapView({ canvas: (canvas as any) as HTMLCanvasElement });
        mapView.addDataSource(datasource);

        const tile = new FakeGeoJsonTile(datasource, new TileKey(1, 1, 5));
        tile.createTextElements(decodedTile, mapView.env);
        // tslint:disable-next-line: deprecation
        const userTextElements = tile.userTextElements;

        // Text element for points.
        const text0Coords = userTextElements.elements[0].points as THREE.Vector3;
        const result0 = {
            x: text0Coords.x,
            y: text0Coords.y,
            text: userTextElements.elements[0].text
        };
        const expectedResult0 = {
            text: "blabla",
            x: 19272186,
            y: -15885961
        };
        assert.deepEqual(result0, expectedResult0);

        // Text paths for lines.
        const text3Coords = userTextElements.elements[2].points as THREE.Vector3[];
        const result3 = {
            x1: text3Coords[0].x,
            y1: text3Coords[0].y,
            x2: text3Coords[1].x,
            y2: text3Coords[1].y,
            text: userTextElements.elements[2].text
        };
        const expectedResult3 = {
            text: "blablabla",
            x1: 18270311.426446024,
            y1: -17936307.727147207,
            x2: 18492950.40803257,
            y2: -17713351.825996723
        };
        assert.deepEqual(result3, expectedResult3);

        // Texts for polygons.
        const text2Coords = userTextElements.elements[1].points as THREE.Vector3;
        const result2 = {
            x: text2Coords.x,
            y: text2Coords.y,
            text: userTextElements.elements[1].text
        };
        const expectedResult2 = {
            text: "blablablabla",
            x: 18492950,
            y: -18010496
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
        mercatorProjection
    );
}
