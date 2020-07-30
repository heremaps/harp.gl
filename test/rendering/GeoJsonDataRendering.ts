/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { FeatureCollection, GeoJson, Light, StyleSet, Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates, TileKey, webMercatorTilingScheme } from "@here/harp-geoutils";
import { LookAtParams, MapView, MapViewEventNames } from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/index-worker";
import { GeoJsonDataProvider, OmvDataSource } from "@here/harp-omv-datasource";
import { OmvTileDecoder } from "@here/harp-omv-datasource/lib/OmvDecoder";
import { RenderingTestHelper, waitForEvent } from "@here/harp-test-utils";

enum VTJsonGeometryType {
    Unknown,
    Point,
    LineString,
    Polygon
}
interface VTJsonFeature {
    geometry: number[][];
    type: VTJsonGeometryType;
}

interface VTJsonTile {
    features: VTJsonFeature[];
}

class ReverseWindingGeoJsonTiler extends GeoJsonTiler {
    /** @override */
    async getTile(indexId: string, tileKey: TileKey): Promise<{}> {
        return super.getTile(indexId, tileKey).then(tile => {
            for (const feature of (tile as VTJsonTile).features) {
                if (feature.type === VTJsonGeometryType.Polygon) {
                    for (const ring of feature.geometry) {
                        ring.reverse();
                    }
                }
            }
            return tile;
        });
    }
}

describe("MapView + OmvDataSource + GeoJsonDataProvider rendering test", function() {
    let mapView: MapView;
    const lights: Light[] = [
        {
            type: "ambient",
            color: "#FFFFFF",
            name: "ambientLight",
            intensity: 0.9
        },
        {
            type: "directional",
            color: "#FFFFFF",
            name: "light1",
            intensity: 0.8,
            direction: {
                x: 1,
                y: 5,
                z: 0.5
            }
        }
    ];

    afterEach(() => {
        if (mapView !== undefined) {
            mapView.dispose();
        }
    });

    interface GeoJsoTestOptions {
        mochaTest: Mocha.Context;
        testImageName: string;
        theme: Theme;
        geoJson: string | GeoJson;
        lookAt?: Partial<LookAtParams>;
        reverseWinding?: boolean;
    }

    async function geoJsonTest(options: GeoJsoTestOptions) {
        const ibct = new RenderingTestHelper(options.mochaTest, { module: "mapview" });
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;

        mapView = new MapView({
            canvas,
            theme: options.theme,
            preserveDrawingBuffer: true,
            pixelRatio: 1
        });
        mapView.animatedExtrusionHandler.enabled = false;

        const defaultLookAt: Partial<LookAtParams> = {
            target: { lat: 53.3, lng: 14.6 },
            distance: 200000,
            tilt: 0,
            heading: 0
        };

        const lookAt: LookAtParams = { ...defaultLookAt, ...options.lookAt } as any;

        mapView.lookAt(lookAt);
        // Shutdown errors cause by firefox bug
        mapView.renderer.getContext().getShaderInfoLog = (x: any) => {
            return "";
        };

        const geoJsonDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            dataProvider: new GeoJsonDataProvider(
                "geojson",
                typeof options.geoJson === "string"
                    ? new URL(options.geoJson, window.location.href)
                    : options.geoJson,
                {
                    tiler:
                        options.reverseWinding === true
                            ? new ReverseWindingGeoJsonTiler()
                            : new GeoJsonTiler()
                }
            ),
            name: "geojson",
            styleSetName: "geojson"
        });

        mapView.addDataSource(geoJsonDataSource);

        await waitForEvent(mapView, MapViewEventNames.FrameComplete);

        await ibct.assertCanvasMatchesReference(canvas, options.testImageName);
    }

    it("renders flat polygon using fill technique", async function() {
        this.timeout(5000);
        const greenStyle: StyleSet = [
            {
                when: "$geometryType == 'polygon'",
                technique: "fill",
                attr: {
                    color: "#008000",
                    opacity: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-polygon-fill",
            theme: { lights, styles: { geojson: greenStyle } },
            geoJson: "../dist/resources/basic_polygon.json"
        });
    });
    it("renders flat polygon using extruded-polygon technique", async function() {
        this.timeout(5000);
        const greenStyle: StyleSet = [
            {
                when: "$geometryType == 'polygon'",
                technique: "extruded-polygon",
                attr: {
                    height: 0,
                    color: "#008000",
                    opacity: 0.9,
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6,
                    metalness: 0.5,
                    roughness: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-flat",
            theme: {
                lights,
                styles: { geojson: greenStyle }
            },
            geoJson: "../dist/resources/basic_polygon.json",
            lookAt: {
                tilt: 45,
                heading: 30
            }
        });
    });

    it("renders extruded polygons with height", async function() {
        this.timeout(5000);

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                attr: {
                    vertexColors: false,
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6,
                    metalness: 0.5,
                    roughness: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-with-height",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            lookAt: {
                tilt: 45,
                heading: 30
            }
        });
    });

    it("renders extruded polygons with height and color - reversed winding", async function() {
        this.timeout(5000);

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                attr: {
                    vertexColors: true,
                    color: ["string", ["get", "color"], "#5050f0"],
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6,
                    metalness: 0.5,
                    roughness: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-with-height-color",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            lookAt: {
                tilt: 45,
                heading: 30
            },
            reverseWinding: true
        });
    });

    it("renders extruded polygons with height and color - no batching", async function() {
        this.timeout(5000);

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                attr: {
                    color: ["string", ["get", "color"], "#5050f0"],
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6,
                    metalness: 0.5,
                    roughness: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-with-height-color-no-batching",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            lookAt: {
                tilt: 45,
                heading: 30
            }
        });
    });

    it("renders multi line strings", async function() {
        this.timeout(5000);

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "LineString"],
                technique: "solid-line",
                color: "red",
                lineWidth: "4px"
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-multilinestring",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson: "../dist/resources/MatchedLinksShape.json",
            lookAt: {
                target: [-0.13603, 51.508],
                zoomLevel: 15
            }
        });
    });

    it("renders geometry touching the tile border", async function() {
        this.timeout(5000);

        const geoJson: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        "fill-color": "rgb(255,255,0)",
                        "stroke-color": "#000"
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [0, 51.5],
                                [0.01, 51.5],
                                [0, 51.49],
                                [0, 51.5]
                            ]
                        ]
                    }
                }
            ]
        };

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill",
                color: ["get", "fill-color"],
                lineColor: ["get", "stroke-color"],
                lineWidth: 1
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-stroke-polygons-at-tile-border",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson,
            lookAt: {
                target: [0, 51.5],
                zoomLevel: 13.4
            }
        });
    });

    it("renders geometry crossing the tile border", async function() {
        this.timeout(5000);

        const geoJson: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        "fill-color": "rgb(255,255,0)",
                        "stroke-color": "#000"
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [-0.01, 51.5],
                                [0.01, 51.5],
                                [0, 51.49],
                                [-0.01, 51.5]
                            ]
                        ]
                    }
                }
            ]
        };

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill",
                color: ["get", "fill-color"],
                lineColor: ["get", "stroke-color"],
                lineWidth: 1
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-stroke-polygons-crossing-tile-border",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson,
            lookAt: {
                target: [0, 51.5],
                zoomLevel: 13.4
            }
        });
    });

    it("renders geometries touching and crossing tile bounds", async function() {
        this.timeout(5000);

        const target = GeoCoordinates.fromGeoPoint([0, 51.5]);
        const tileKey = webMercatorTilingScheme.getTileKey(target, 13)!;
        const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);

        const offset = 0.002;

        const geoJson: FeatureCollection = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        "fill-color": "rgb(255,255,0)",
                        "stroke-color": "#000",
                        "sort-rank": 1
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [geoBox.center.longitude, geoBox.north + offset],
                                [geoBox.east + offset, geoBox.center.latitude],
                                [geoBox.center.longitude, geoBox.south - offset],
                                [geoBox.west - offset, geoBox.center.latitude],
                                [geoBox.center.longitude, geoBox.north + offset]
                            ]
                        ]
                    }
                },
                {
                    type: "Feature",
                    properties: {
                        "fill-color": "rgba(0, 0, 0, 0.1)",
                        "stroke-color": "#000",
                        "sort-rank": 0
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [geoBox.west, geoBox.north],
                                [geoBox.east, geoBox.north],
                                [geoBox.east, geoBox.south],
                                [geoBox.west, geoBox.south],
                                [geoBox.west, geoBox.north]
                            ]
                        ]
                    }
                }
            ]
        };

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill",
                color: ["get", "fill-color"],
                lineColor: ["get", "stroke-color"],
                lineWidth: 1,
                renderOrder: ["get", "sort-rank"]
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-stroke-polygons-touching-and-crossing-tile-border",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson,
            lookAt: {
                zoomLevel: 13.01,
                target: geoBox.center
            }
        });
    });
});
