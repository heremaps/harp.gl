/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Feature, FeatureCollection, Styles, Theme } from "@here/harp-datasource-protocol";
import { clipLineString } from "@here/harp-geometry/lib/ClipLineString";
import { wrapLineString } from "@here/harp-geometry/lib/WrapLineString";
import { wrapPolygon } from "@here/harp-geometry/lib/WrapPolygon";
import {
    EarthConstants,
    GeoBox,
    GeoCoordinates,
    GeoPointLike,
    TileKey,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@here/harp-geoutils";
import { LookAtParams } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import * as turf from "@turf/turf";
import { Vector2, Vector3 } from "three";

import * as polygon_crossing_antimeridian from "../resources/polygon_crossing_antimeridian.json";
import { GeoJsonStore } from "./utils/GeoJsonStore";
import { GeoJsonTest } from "./utils/GeoJsonTest";
import { ThemeBuilder } from "./utils/ThemeBuilder";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("MapView + OmvDataSource + GeoJsonDataProvider rendering test", function () {
    const geoJsonTest = new GeoJsonTest();

    // get the default lighting set up.fterEach(() => geoJsonTest.dispose());
    const lights = ThemeBuilder.lights;

    afterEach(() => geoJsonTest.dispose());
    it("renders flat polygon using fill technique", async function () {
        this.timeout(5000);
        const greenStyle: Styles = [
            {
                when: "$geometryType == 'polygon'",
                technique: "fill",
                attr: {
                    color: "#008000",
                    opacity: 0.5
                }
            }
        ];

        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-polygon-fill",
            theme: { lights, styles: { geojson: greenStyle } },
            geoJson: "../dist/resources/basic_polygon.json"
        });
    });
    it("renders flat polygon using extruded-polygon technique", async function () {
        this.timeout(5000);
        const greenStyle: Styles = [
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

        await geoJsonTest.run({
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

    it("renders japanese flag with enabled as dynamic expression", async function () {
        this.timeout(50000);
        const greenStyle: Styles = [
            {
                when: ["==", ["geometry-type"], "Point"],
                technique: "circles",
                renderOrder: 10000,
                // select the color based on the the value of the dynamic property `correct`.
                color: "#BC002D",
                // This causes the bug HARP-12247
                enabled: ["get", "enabled", ["dynamic-properties"]],
                size: ["get", "size", ["dynamic-properties"]]
            }
        ];

        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-point-enabled-as-dynamic-expression",
            theme: { lights, styles: { geojson: greenStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            size: 150
        });
    });
    it("renders extruded polygons with height", async function () {
        this.timeout(5000);

        const ourStyle: Styles = [
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

        await geoJsonTest.run({
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

    it("renders extruded polygons with height and color", async function () {
        this.timeout(5000);

        const ourStyle: Styles = [
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

        await geoJsonTest.run({
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

    it("renders extruded polygons with height and color - no batching", async function () {
        this.timeout(5000);

        const ourStyle: Styles = [
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

        await geoJsonTest.run({
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

    it("renders extruded polygons with height, without outline", async function () {
        this.timeout(5000);

        const ourStyle: Styles = [
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

        await geoJsonTest.run({
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
        async function () {
            this.timeout(5000);

            const ourStyle: Styles = [
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

            await geoJsonTest.run({
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
        async function () {
            this.timeout(5000);

            const ourStyle: Styles = [
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

            await geoJsonTest.run({
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

    it("renders multi line strings", async function () {
        this.timeout(5000);

        const ourStyle: Styles = [
            {
                when: ["==", ["geometry-type"], "LineString"],
                technique: "solid-line",
                color: "red",
                lineWidth: "4px"
            }
        ];

        await geoJsonTest.run({
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

    it("renders geometry touching the tile border", async function () {
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

        const ourStyle: Styles = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill",
                color: ["get", "fill-color"],
                lineColor: ["get", "stroke-color"],
                lineWidth: 1
            }
        ];

        await geoJsonTest.run({
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

    it("renders geometry crossing the tile border", async function () {
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

        const ourStyle: Styles = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill",
                color: ["get", "fill-color"],
                lineColor: ["get", "stroke-color"],
                lineWidth: 1
            }
        ];

        await geoJsonTest.run({
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

    it("renders geometries touching and crossing tile bounds", async function () {
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

        const ourStyle: Styles = [
            {
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill",
                color: ["get", "fill-color"],
                lineColor: ["get", "stroke-color"],
                lineWidth: 1,
                renderOrder: ["get", "sort-rank"]
            }
        ];

        await geoJsonTest.run({
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

    describe("wrap polygon crossing antimeridian", async function () {
        const ourStyle: Styles = [
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

        it(`polygon to wrap`, async function () {
            this.timeout(5000);

            await geoJsonTest.run({
                lookAt,
                mochaTest: this,
                testImageName: `geojson-wrap-polygon-crossing-antimeridian`,
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: polygon_crossing_antimeridian as any
            });
        });

        it(`wrapped polygon - merged`, async function () {
            this.timeout(5000);

            await geoJsonTest.run({
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

            it(`wrapped polygon - ${part}`, async function () {
                this.timeout(5000);

                await geoJsonTest.run({
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

    describe("wrap linestring crossing antimeridian", async function () {
        const ourStyle: Styles = [
            {
                when: ["all", ["==", ["geometry-type"], "Polygon"], ["!has", "fragment"]],
                technique: "solid-line",
                color: "rgba(255,0,0,1)",
                lineWidth: "2px"
            },
            {
                when: [
                    "all",
                    ["==", ["geometry-type"], "LineString"],
                    ["==", ["get", "fragment"], "left"]
                ],
                technique: "solid-line",
                color: "rgba(255,0,0,1)",
                lineWidth: "2px",
                caps: "Round",
                renderOrder: 1
            },
            {
                when: [
                    "all",
                    ["==", ["geometry-type"], "LineString"],
                    ["==", ["get", "fragment"], "middle"]
                ],
                technique: "solid-line",
                color: "rgba(0,255,0,1)",
                lineWidth: "2px",
                renderOrder: 0
            },
            {
                when: [
                    "all",
                    ["==", ["geometry-type"], "LineString"],
                    ["==", ["get", "fragment"], "right"]
                ],
                technique: "solid-line",
                color: "rgba(0,0,255,1)",
                lineWidth: "2px",
                renderOrder: 1
            },
            {
                when: ["all", ["==", ["geometry-type"], "LineString"], ["!has", "fragment"]],
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
        const wrappedLineString = wrapLineString(coordinates);

        // Extracts a part (left, middle or right) from the wrapped polygon
        // and convert it to a GeoJson feature.
        const toGeoJsonMultiLineString = (part: string): Feature => {
            const coordinates: GeoCoordinates[][] | undefined = (wrappedLineString as any)[part];

            // Converts an Array of GeoCoordinates to GeoJSON coordinates.
            const toGeoJsonCoordinates = (coordinates: GeoCoordinates[][] | undefined) => {
                coordinates = coordinates ?? [];
                return coordinates.map(line => {
                    return line.map(({ lat, lng }) => [lng, lat]);
                });
            };

            return {
                type: "Feature",
                properties: {
                    fragment: part
                },
                geometry: {
                    type: "MultiLineString",
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

        it(`linestring to wrap`, async function () {
            this.timeout(5000);

            await geoJsonTest.run({
                lookAt,
                mochaTest: this,
                testImageName: `geojson-wrap-linestring-crossing-antimeridian`,
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: polygon_crossing_antimeridian as any
            });
        });

        it(`wrapped linestring - merged`, async function () {
            this.timeout(5000);

            await geoJsonTest.run({
                lookAt,
                mochaTest: this,
                testImageName: `geojson-wrap-linestring-crossing-antimeridian-merged`,
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: {
                    type: "FeatureCollection",
                    features: [
                        toGeoJsonMultiLineString("left"),
                        toGeoJsonMultiLineString("middle"),
                        toGeoJsonMultiLineString("right"),
                        separator
                    ]
                }
            });
        });

        for (const part in wrappedLineString) {
            if (!wrappedLineString.hasOwnProperty(part)) {
                continue;
            }

            const feature = toGeoJsonMultiLineString(part);

            it(`wrapped linestring - ${part}`, async function () {
                this.timeout(5000);

                await geoJsonTest.run({
                    lookAt,
                    mochaTest: this,
                    testImageName: `geojson-wrap-linestring-crossing-antimeridian-${part}`,
                    theme: { lights, styles: { geojson: ourStyle } },
                    geoJson: {
                        type: "FeatureCollection",
                        features: [feature, separator]
                    }
                });
            });
        }
    });

    describe("clip lines against bounds", async function () {
        it("clip long line string", async function () {
            const bounds: GeoPointLike[] = [
                [-2.8125, -15.28418511407642],
                [76.9921875, -15.28418511407642],
                [76.9921875, 54.77534585936447],
                [-2.8125, 54.77534585936447],
                [-2.8125, -15.28418511407642]
            ];

            const geoBox = new GeoBox(
                GeoCoordinates.fromGeoPoint(bounds[0]),
                GeoCoordinates.fromGeoPoint(bounds[0])
            );

            bounds.forEach(geoPoint => {
                geoBox.growToContain(GeoCoordinates.fromGeoPoint(geoPoint));
            });

            const { west, south, east, north } = geoBox;

            const { min, max } = webMercatorTilingScheme.projection.projectBox(geoBox);

            const inputLineString: GeoPointLike[] = [
                [-28.125, 33.43144133557529],
                [-24.609375, 49.38237278700955],
                [-9.140625, 39.36827914916014],
                [21.4453125, 44.08758502824516],
                [25.6640625, 61.60639637138628],
                [45, 45.82879925192134],
                [56.6015625, 62.2679226294176],
                [61.87499999999999, 43.32517767999296],
                [88.24218749999999, 39.639537564366684],
                [84.72656249999999, 14.26438308756265],
                [53.78906249999999, 13.923403897723347],
                [33.3984375, 27.994401411046148],
                [52.734375, 35.17380831799959],
                [58.71093750000001, 28.613459424004414],
                [61.52343749999999, 35.460669951495305],
                [38.67187499999999, 39.639537564366684],
                [16.875, 32.24997445586331],
                [12.65625, 14.604847155053898],
                [-14.0625, -4.214943141390639],
                [41.1328125, -26.11598592533351]
            ];

            const points = inputLineString.map(geoPos => {
                const { x, y } = webMercatorProjection.projectPoint(
                    GeoCoordinates.fromGeoPoint(geoPos)
                );
                return new Vector2(x, y);
            });

            const lineStrings = clipLineString(points, min.x, min.y, max.x, max.y);

            const coordinates = lineStrings.map(lineString =>
                lineString.map(({ x, y }) =>
                    webMercatorProjection.unprojectPoint(new Vector3(x, y, 0)).toGeoPoint()
                )
            );

            const geoJson = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "Polygon",
                            coordinates: [
                                [
                                    [west, south],
                                    [east, south],
                                    [east, north],
                                    [west, north],
                                    [west, south]
                                ]
                            ]
                        }
                    },
                    {
                        type: "Feature",
                        properties: {
                            color: "#00ff00"
                        },
                        geometry: {
                            type: "LineString",
                            coordinates: inputLineString
                        }
                    },
                    {
                        type: "Feature",
                        properties: {
                            color: "#ff0000"
                        },
                        geometry: {
                            type: "MultiLineString",
                            coordinates
                        }
                    }
                ]
            };

            const ourStyle: Styles = [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "fill",
                    color: "rgba(100,100,100,0.5)",
                    lineWidth: 2
                },
                {
                    when: ["==", ["geometry-type"], "LineString"],
                    technique: "solid-line",
                    metricUnit: "Pixel",
                    color: ["get", "color"],
                    lineWidth: 2
                }
            ];

            await geoJsonTest.run({
                mochaTest: this,
                testImageName: "geojson-clip-line-against-tile-border",
                theme: { lights, styles: { geojson: ourStyle } },
                geoJson: geoJson as any,
                lookAt: {
                    zoomLevel: 2,
                    target: geoBox.center
                }
            });
        });
    });

    describe("Tiled GeoJson", async function () {
        it("Circle with an hole with same winding as the outer ring", async function () {
            const dataProvider = new (class extends DataProvider {
                ready(): boolean {
                    return true;
                }

                async getTile(tileKey: TileKey) {
                    const geoBox = webMercatorTilingScheme.getGeoBox(tileKey);
                    const { longitudeSpan, center } = geoBox;
                    const [cx, cy] = center.toGeoPoint();

                    const circle = turf.circle([cx, cy], longitudeSpan * 0.1, {
                        units: "degrees"
                    });

                    const innerCircle = turf.circle([cx, cy], longitudeSpan * 0.04, {
                        units: "degrees"
                    });

                    const ring = turf.polygon([
                        ...circle.geometry!.coordinates,
                        ...innerCircle.geometry!.coordinates
                    ]);

                    return turf.featureCollection([ring]);
                }

                protected async connect(): Promise<void> {}

                protected dispose(): void {}
            })();

            await geoJsonTest.run({
                dataProvider,
                mochaTest: this,
                testImageName: "geojson-polygon-holes-windings",
                theme: {
                    styles: [
                        {
                            styleSet: "geojson",
                            when: ["==", ["geometry-type"], "Polygon"],
                            technique: "fill",
                            color: "red",
                            lineColor: "#000",
                            lineWidth: 1
                        }
                    ]
                },
                lookAt: {
                    zoomLevel: 14.0,
                    target: webMercatorTilingScheme.getGeoBox(
                        webMercatorTilingScheme.getTileKey(
                            GeoCoordinates.fromGeoPoint([-90, -42.52556]),
                            13
                        )!
                    ).center
                }
            });
        });
    });

    describe("Polygons", async function () {
        it("Triangle with a hole rendered at zoom level 2", async function () {
            const theme: Theme = {
                lights,
                styles: [
                    {
                        styleSet: "geojson",
                        when: ["==", ["geometry-type"], "Polygon"],
                        technique: "fill",
                        color: "rgba(100,100,100,0.5)",
                        lineWidth: 2
                    }
                ]
            };

            const polygon = turf.polygon([
                [
                    [0, 0, 0],
                    [170, 35, 0],
                    [170, -35, 0],
                    [0, 0, 0]
                ],
                [
                    [0, 0, 0],
                    [170, 15, 0],
                    [170, -15, 0],
                    [0, 0, 0]
                ]
            ]);

            const [lng, lat] = turf.center(polygon).geometry!.coordinates;

            const geoJsonStore = new GeoJsonStore();

            geoJsonStore.features.insert(polygon);

            await geoJsonTest.run({
                mochaTest: this,
                testImageName: "geojson-triangle-with-hole-at-zoom-level-2",
                dataProvider: geoJsonStore,
                theme,
                lookAt: {
                    zoomLevel: 2,
                    target: [lng, lat]
                }
            });
        });
    });
});
