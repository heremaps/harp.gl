/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    Feature,
    FeatureCollection,
    GeoJson,
    Light,
    StyleSet,
    Theme
} from "@here/harp-datasource-protocol";
import { wrapPolygon } from "@here/harp-geometry/lib/WrapPolygon";
import { EarthConstants, GeoCoordinates, webMercatorTilingScheme } from "@here/harp-geoutils";
import { LookAtParams, MapView, MapViewEventNames } from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/index-worker";
import { RenderingTestHelper, waitForEvent } from "@here/harp-test-utils";
import { GeoJsonDataProvider, VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { VectorTileDecoder } from "@here/harp-vectortile-datasource/lib/VectorTileDecoder";

import * as polygon_crossing_antimeridian from "../resources/polygon_crossing_antimeridian.json";

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
        width?: number;
        height?: number;
    }

    async function geoJsonTest(options: GeoJsoTestOptions) {
        const ibct = new RenderingTestHelper(options.mochaTest, { module: "mapview" });
        const canvas = document.createElement("canvas");
        canvas.width = options.width ?? 400;
        canvas.height = options.height ?? 300;

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

        const geoJsonDataSource = new VectorTileDataSource({
            decoder: new VectorTileDecoder(),
            dataProvider: new GeoJsonDataProvider(
                "geojson",
                typeof options.geoJson === "string"
                    ? new URL(options.geoJson, window.location.href)
                    : options.geoJson,
                { tiler: new GeoJsonTiler() }
            ),
            name: "geojson",
            styleSetName: "geojson"
        });

        mapView.setDynamicProperty("enabled", true);
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

    it("renders japanese flag with enabled as dynamic expression", async function() {
        this.timeout(50000);
        const greenStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Point"],
                technique: "circles",
                renderOrder: 10000,
                attr: {
                    // select the color based on the the value of the dynamic property `correct`.
                    color: "#BC002D",
                    // Japanese flag's point is 3/5 the height, 200*0.6==120.
                    size: 120,
                    // This causes the bug HARP-12247
                    enabled: ["get", "enabled", ["dynamic-properties"]]
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-polygon-fill",
            theme: { lights, styles: { geojson: greenStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            // Width / Height / Point size to display the Japanese flag
            width: 300,
            height: 200
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

    it("renders extruded polygons with height and color", async function() {
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
            }
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

    it("renders extruded polygons with height, without outline", async function() {
        this.timeout(5000);

        const ourStyle: StyleSet = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                attr: {
                    vertexColors: false,
                    lineWidth: 0,
                    lineColor: "#172023",
                    lineColorMix: 0.6,
                    metalness: 0.5,
                    roughness: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-with-height-no-outline",
            theme: { lights, styles: { geojson: ourStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            lookAt: {
                tilt: 45,
                heading: 30
            }
        });
    });

    it(
        "renders extruded polygons with height, with lineWidth Expression," + " resulting in 0",
        async function() {
            this.timeout(5000);

            const ourStyle: StyleSet = [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    attr: {
                        vertexColors: false,
                        lineWidth: {
                            interpolation: "Discrete",
                            zoomLevels: [9, 12],
                            values: [0.0, 1.0]
                        },
                        lineColor: "#172023",
                        lineColorMix: 0.6,
                        metalness: 0.5,
                        roughness: 0.5
                    }
                }
            ];

            await geoJsonTest({
                mochaTest: this,
                testImageName: "geojson-extruded-polygon-linewidth-expression-to-zero",
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: "../dist/resources/basic_polygon.json",
                lookAt: {
                    tilt: 45,
                    heading: 30,
                    zoomLevel: 9
                }
            });
        }
    );

    it(
        "renders extruded polygons with height, with lineWidth Expression," + " resulting in 1",
        async function() {
            this.timeout(5000);

            const ourStyle: StyleSet = [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    attr: {
                        vertexColors: false,
                        lineWidth: {
                            interpolation: "Discrete",
                            zoomLevels: [9, 12],
                            values: [1.0, 0.0]
                        },
                        lineColor: "#172023",
                        lineColorMix: 0.6,
                        metalness: 0.5,
                        roughness: 0.5
                    }
                }
            ];

            await geoJsonTest({
                mochaTest: this,
                testImageName: "geojson-extruded-polygon-linewidth-expression-to-one",
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: "../dist/resources/basic_polygon.json",
                lookAt: {
                    tilt: 45,
                    heading: 30,
                    zoomLevel: 9
                }
            });
        }
    );

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

    describe("wrap polygon crossing antimeridian", async function() {
        const ourStyle: StyleSet = [
            {
                when: ["all", ["==", ["geometry-type"], "Polygon"], ["!has", "fragment"]],
                technique: "solid-line",
                color: "rgba(255,0,0,1)",
                lineWidth: "2px"
            },
            {
                when: [
                    "all",
                    ["==", ["geometry-type"], "Polygon"],
                    ["==", ["get", "fragment"], "left"]
                ],
                technique: "fill",
                color: "rgba(255,0,0,0.5)",
                lineColor: "rgb(0,0,0)",
                lineWidth: 1,
                renderOrder: 1
            },
            {
                when: [
                    "all",
                    ["==", ["geometry-type"], "Polygon"],
                    ["==", ["get", "fragment"], "middle"]
                ],
                technique: "fill",
                color: "rgba(0,255,0,0.5)",
                lineColor: "rgb(0,0,0)",
                lineWidth: 1,
                renderOrder: 0
            },
            {
                when: [
                    "all",
                    ["==", ["geometry-type"], "Polygon"],
                    ["==", ["get", "fragment"], "right"]
                ],
                technique: "fill",
                color: "rgba(0,0,255,0.5)",
                lineColor: "rgb(0,0,0)",
                lineWidth: 1,
                renderOrder: 1
            },
            {
                when: ["==", ["geometry-type"], "LineString"],
                technique: "solid-line",
                lineWidth: "2px",
                color: "rgb(0,0,0)"
            }
        ];

        // Convert the coordinates of the polygon from GeoJson to GeoCoordinates.
        const coordinates = polygon_crossing_antimeridian.features[0].geometry.coordinates[0].map(
            ([lng, lat]) => GeoCoordinates.fromGeoPoint([lng, lat])
        );

        // Split the polygon in 3 parts.
        const wrappedPolygon = wrapPolygon(coordinates);

        // Extracts a part (left, middle or right) from the wrapped polygon
        // and convert it to a GeoJson feature.
        const toGeoPolygonFeature = (part: string): Feature => {
            const coordinates: GeoCoordinates[] | undefined = (wrappedPolygon as any)[part];

            // Converts an Array of GeoCoordinates to GeoJSON coordinates.
            const toGeoJsonCoordinates = (coordinates: GeoCoordinates[] | undefined) => [
                (coordinates ?? []).map(({ lat, lng }) => [lng, lat])
            ];

            return {
                type: "Feature",
                properties: {
                    fragment: part
                },
                geometry: {
                    type: "Polygon",
                    coordinates: toGeoJsonCoordinates(coordinates)
                }
            };
        };

        const separator: Feature = {
            type: "Feature",
            properties: {},
            geometry: {
                type: "LineString",
                coordinates: [
                    [180, 90],
                    [180, -90]
                ]
            }
        };

        const lookAt: Partial<LookAtParams> = {
            target: [-160, 40],
            distance: EarthConstants.EQUATORIAL_CIRCUMFERENCE * 2.5
        };

        it(`polygon to wrap`, async function() {
            this.timeout(5000);

            await geoJsonTest({
                lookAt,
                mochaTest: this,
                testImageName: `geojson-wrap-polygon-crossing-antimeridian`,
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: polygon_crossing_antimeridian as any
            });
        });

        it(`wrapped polygon - merged`, async function() {
            this.timeout(5000);

            await geoJsonTest({
                lookAt,
                mochaTest: this,
                testImageName: `geojson-wrap-polygon-crossing-antimeridian-merged`,
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: {
                    type: "FeatureCollection",
                    features: [
                        toGeoPolygonFeature("left"),
                        toGeoPolygonFeature("middle"),
                        toGeoPolygonFeature("right"),
                        separator
                    ]
                }
            });
        });

        for (const part in wrappedPolygon) {
            if (!wrappedPolygon.hasOwnProperty(part)) {
                continue;
            }

            const feature = toGeoPolygonFeature(part);

            it(`wrapped polygon - ${part}`, async function() {
                this.timeout(5000);

                await geoJsonTest({
                    lookAt,
                    mochaTest: this,
                    testImageName: `geojson-wrap-polygon-crossing-antimeridian-${part}`,
                    theme: { lights, styles: { geojson: ourStyle } },
                    geoJson: {
                        type: "FeatureCollection",
                        features: [feature, separator]
                    }
                });
            });
        }
    });
});
