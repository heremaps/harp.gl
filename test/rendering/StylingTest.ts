/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as THREE from "three";

import {
    CirclesStyle,
    ExtrudedPolygonStyle,
    Feature,
    FeatureCollection,
    FillStyle,
    GeometryCollection,
    Light,
    SolidLineStyle,
    StyleDeclaration,
    TextTechniqueStyle,
    TextureCoordinateType,
    Theme
} from "@here/harp-datasource-protocol";
import { FeaturesDataSource } from "@here/harp-features-datasource";
import { GeoBox, GeoCoordinates, ProjectionType } from "@here/harp-geoutils";
import { MapView, MapViewEventNames } from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/index-worker";
import { OmvTileDecoder } from "@here/harp-omv-datasource/index-worker";
import { getPlatform, RenderingTestHelper, TestOptions, waitForEvent } from "@here/harp-test-utils";
import { getReferenceImageUrl } from "@here/harp-test-utils/lib/rendering/ReferenceImageLocator";
import { getOptionValue, mergeWithOptions } from "@here/harp-utils";

interface RenderingTestOptions extends TestOptions {
    /**
     * Width of canvas in pixels.
     * @defult `100` or `height` if given
     */
    width?: number;
    /**
     * Height of canvas in pixels.
     * @defult `100` or `width` if given
     */
    height?: number;
}

function baseRenderingTest(
    name: string,
    options: RenderingTestOptions,
    testFun: (canvas: HTMLCanvasElement) => Promise<void>
) {
    const commonTestOptions = { module: "harp.gl" };
    const imageUrl = getReferenceImageUrl({ ...commonTestOptions, platform: getPlatform(), name });

    RenderingTestHelper.cachedLoadImageData(imageUrl).catch(_ => {
        // We can ignore error here, as _if_ this file was really needed, then test
        // will try to resolve this promise and report failure in test context.
    });
    it(name, async function() {
        let canvas: HTMLCanvasElement | undefined;
        // TODO: remove `module` name from RenderingTestHalper API
        try {
            const ibct = new RenderingTestHelper(this, commonTestOptions);

            canvas = document.createElement("canvas");
            canvas.width = options.width ?? options.height ?? 100;
            canvas.height = options.height ?? options.width ?? 100;

            await testFun(canvas);

            await ibct.assertCanvasMatchesReference(canvas, name, options);
        } finally {
            if (canvas !== undefined) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = undefined!;
            }
        }
    });
}

function mapViewFitGeoBox(mapView: MapView, geoBox: GeoBox, margin: number = 0.1): LookAtParams {
    if (mapView.projection.type !== ProjectionType.Planar) {
        throw new Error("mapViewFitGeoBox doesn't support non-planar projections");
    }

    const boundingBox = new THREE.Box3();
    const tmpVec3 = new THREE.Vector3();
    mapView.projection.projectBox(geoBox, boundingBox);

    const size = boundingBox.getSize(tmpVec3);
    const viewSize = Math.max(size.x, size.y);

    const fov = mapView.camera.fov;
    const height = (viewSize / 2) * (1 / Math.tan(THREE.MathUtils.degToRad(fov / 2)));

    boundingBox.getCenter(tmpVec3);
    const { latitude, longitude } = mapView.projection.unprojectPoint(tmpVec3);
    return {
        latitude,
        longitude,
        distance: height * (1 + margin),
        tilt: 0,
        azimuth: 0
    };
}

interface LookAtParams {
    latitude: number;
    longitude: number;
    distance: number;
    tilt: number;
    azimuth: number;
}

interface GeoJsonMapViewRenderingTestOptions extends RenderingTestOptions {
    theme: Theme;
    geoJson: FeatureCollection | GeometryCollection | Feature;
    margin?: number;
    lookAt?: Partial<LookAtParams>;
}

function mapViewFeaturesRenderingTest(
    name: string,
    options: GeoJsonMapViewRenderingTestOptions,
    testFun?: (mapView: MapView, dataSource: FeaturesDataSource) => Promise<void>
) {
    baseRenderingTest(name, options, async function(canvas) {
        let mapView: MapView | undefined;
        try {
            //document.body.appendChild(canvas);
            mapView = new MapView({
                canvas,
                theme: options.theme ?? {},
                preserveDrawingBuffer: true,
                pixelRatio: 1
            });
            mapView.animatedExtrusionHandler.enabled = false;
            const dataSource = new FeaturesDataSource({
                styleSetName: "geojson",
                geojson: options.geoJson,
                decoder: new OmvTileDecoder(),
                tiler: new GeoJsonTiler()
            });
            mapView.addDataSource(dataSource);

            const geoBox = dataSource.getGeoBox()!;
            assert.isDefined(geoBox);

            const defaultLookAt: LookAtParams = mapViewFitGeoBox(
                mapView,
                geoBox,
                getOptionValue(options.margin, 0.15)
            );

            const lookAt = mergeWithOptions(defaultLookAt, options.lookAt);
            mapView.lookAt(
                new GeoCoordinates(lookAt.latitude, lookAt.longitude),
                lookAt.distance,
                lookAt.tilt,
                lookAt.azimuth
            );

            mapView.update();
            if (testFun !== undefined) {
                await testFun(mapView, dataSource);
            } else {
                await waitForEvent(mapView, MapViewEventNames.FrameComplete);
            }
        } finally {
            if (mapView !== undefined) {
                mapView.dispose();
                mapView = undefined!;
            }
        }
    });
}

describe("MapView Styling Test", function() {
    const referenceBackground: Feature = {
        // background polygon, taking about half of view
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [0.004, 0.004],
                    [-0.0, 0.004],
                    [-0.0, -0.004],
                    [0.004, -0.004],
                    [0.004, 0.004]
                ]
            ]
        },
        properties: {
            kind: "background"
        }
    };
    const referenceBackroundStyle: StyleDeclaration = {
        when: "$geometryType == 'polygon' && kind == 'background'",
        technique: "fill",
        final: true,
        attr: {
            color: "#22f"
        }
    };
    const themeTextSettings: Theme = {
        fontCatalogs: [
            {
                name: "fira",
                url: "../@here/harp-fontcatalog/resources/Default_FontCatalog.json"
            }
        ]
    };

    describe("point features", function() {
        const points: Feature[] = [
            {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [0.003, 0.001]
                },
                properties: {
                    name: "aBcD"
                }
            },
            {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [-0.003, 0.001]
                },
                properties: {
                    name: "aBcD"
                }
            },
            {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [0.0, -0.002]
                },
                properties: {
                    name: "aBcD"
                }
            }
        ];
        function makePointTextTestCases(
            testCases: { [name: string]: TextTechniqueStyle["attr"] },
            options?: Partial<GeoJsonMapViewRenderingTestOptions>
        ) {
            // tslint:disable-next-line:forin
            for (const testCase in testCases) {
                const attr: TextTechniqueStyle["attr"] = testCases[testCase]!;
                mapViewFeaturesRenderingTest(`solid-line-styling-${testCase}`, {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [
                            // tested horizontal line
                            ...points,
                            referenceBackground
                        ]
                    },
                    theme: {
                        ...themeTextSettings,
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'point'",
                                    technique: "text",
                                    attr
                                }
                            ]
                        }
                    },
                    ...options
                });
            }
        }
        function makePointTestCases(
            testCases: { [name: string]: CirclesStyle["attr"] },
            options?: Partial<GeoJsonMapViewRenderingTestOptions>
        ) {
            // tslint:disable-next-line:forin
            for (const testCase in testCases) {
                const attr: CirclesStyle["attr"] = testCases[testCase]!;
                mapViewFeaturesRenderingTest(`solid-line-styling-${testCase}`, {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [
                            // tested horizontal line
                            ...points,
                            referenceBackground
                        ]
                    },
                    theme: {
                        ...themeTextSettings,
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'point'",
                                    technique: "circles",
                                    attr
                                }
                            ]
                        }
                    },
                    ...options
                });
            }
        }

        describe("text", function() {
            makePointTextTestCases(
                {
                    "point-text-basic": { color: "#f0f", size: 16 },
                    "point-text-rgba": { color: "#f0f9", size: 16 },
                    "point-text-bg-rgba": {
                        color: "#f0f",
                        backgroundSize: 6,
                        backgroundColor: "#0008",
                        size: 16
                    }
                },
                {
                    margin: 0.5
                }
            );
        });

        describe("circles", function() {
            makePointTestCases(
                {
                    "point-circles-basic": { color: "#ca6", size: 10 },
                    "point-circles-rgba": { color: "#ca69", size: 10 },
                    "point-circles-rgb-opacity": { color: "#ca6", opacity: 0.5, size: 10 },
                    "point-circles-rgba-opacity": { color: "#ca69", opacity: 0.5, size: 10 }
                },
                {
                    margin: 0.5
                }
            );
        });
    });
    describe("line features", function() {
        const straightLine: Feature = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [
                    [0.004, 0.001],
                    [-0.004, 0.001]
                ]
            }
        };
        const shortLine: Feature = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [
                    [0.004, 0.001],
                    [0.0, 0.001]
                ]
            }
        };
        const diagonalLine: Feature = {
            type: "Feature",
            geometry: {
                type: "LineString",
                coordinates: [
                    [0.004, -0.004],
                    [-0.004, 0.004]
                ]
            }
        };

        function makeLineTestCase(
            testCases: { [name: string]: SolidLineStyle["attr"] },
            lineGeometry: Feature = straightLine
        ) {
            // tslint:disable-next-line:forin
            for (const testCase in testCases) {
                const attr: SolidLineStyle["attr"] = testCases[testCase]!;
                mapViewFeaturesRenderingTest(`solid-line-styling-${testCase}`, {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [lineGeometry, referenceBackground]
                    },
                    theme: {
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'line'",
                                    technique: "solid-line",
                                    attr
                                }
                            ]
                        }
                    }
                });
            }
        }
        // describe("solid-line technique", function() {
        //     describe("basic", function() {
        //         makeLineTestCase({
        //             "basic-100m": { lineWidth: 100, color: "#0b97c4" },
        //             "basic-dash-100m": {
        //                 lineWidth: 100,
        //                 color: "#0b97c4",
        //                 dashSize: 80,
        //                 gapSize: 80
        //             },
        //             "basic-100m-rgba": { lineWidth: 100, color: "#0b97c470" },
        //             "basic-100m-rgba-square": {
        //                 lineWidth: 100,
        //                 color: "#0b97c470",
        //                 caps: "Square"
        //             },
        //             "basic-100m-rgba-triangle-out": {
        //                 lineWidth: 100,
        //                 color: "#0b97c470",
        //                 caps: "TriangleIn"
        //             },
        //             "basic-100m-rgba-trianglein": {
        //                 lineWidth: 100,
        //                 color: "#0b97c470",
        //                 caps: "TriangleOut"
        //             },
        //             "basic-100m-rgba-none": { lineWidth: 100, color: "#0b97c470", caps: "None" },
        //             "basic-10px-rgba": { lineWidth: "10px", color: "#0b97c470" }
        //         });
        //         // Short line that ends on tile border
        //         makeLineTestCase(
        //             {
        //                 "short-100m": { lineWidth: 100, color: "#0b97c4" },
        //                 "short-100m-rgba": { lineWidth: 100, color: "#0b97c470" },
        //                 "short-100m-rgba-square": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "Square"
        //                 },
        //                 "short-100m-rgba-triangle-out": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "TriangleIn"
        //                 },
        //                 "short-100m-rgba-trianglein": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "TriangleOut"
        //                 },
        //                 "short-100m-rgba-none": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "None"
        //                 },
        //                 "short-10px-rgba": { lineWidth: "10px", color: "#0b97c470" }
        //             },
        //             shortLine
        //         );
        //         // Diagonal lines are buggy at the moment
        //         makeLineTestCase(
        //             {
        //                 "diagonal-100m": { lineWidth: 100, color: "#0b97c4" },
        //                 "diagonal-dash-100m": {
        //                     lineWidth: 100,
        //                     color: "#0b97c4",
        //                     dashSize: 80,
        //                     gapSize: 80
        //                 },
        //                 "diagonal-100m-rgba": { lineWidth: 100, color: "#0b97c470" },
        //                 "diagonal-100m-rgba-square": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "Square"
        //                 },
        //                 "diagonal-100m-rgba-triangle-out": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "TriangleIn"
        //                 },
        //                 "diagonal-100m-rgba-trianglein": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "TriangleOut"
        //                 },
        //                 "diagonal-100m-rgba-none": {
        //                     lineWidth: 100,
        //                     color: "#0b97c470",
        //                     caps: "None"
        //                 },
        //                 "diagonal-10px-rgba": { lineWidth: "10px", color: "#0b97c470" }
        //             },
        //             diagonalLine
        //         );
        //     });

        //     describe("with outline", function() {
        //         makeLineTestCase({
        //             "outline-10px-2px": {
        //                 // BUGGY ?
        //                 lineWidth: "10px",
        //                 color: "#0b97c4",
        //                 outlineWidth: "2px",
        //                 outlineColor: "#7f7"
        //             },
        //             "outline-10px-2px-rgba": {
        //                 lineWidth: "10px",
        //                 color: "#0b97c470",
        //                 outlineWidth: "2px",
        //                 outlineColor: "#7f7"
        //             }
        //         });
        //         // Short line that end on tile border
        //         makeLineTestCase(
        //             {
        //                 "short-outline-10px-2px": {
        //                     // BUGGY ?
        //                     lineWidth: "10px",
        //                     color: "#0b97c4",
        //                     outlineWidth: "2px",
        //                     outlineColor: "#7f7"
        //                 },
        //                 "short-outline-10px-2px-rgba": {
        //                     lineWidth: "10px",
        //                     color: "#0b97c470",
        //                     outlineWidth: "2px",
        //                     outlineColor: "#7f7"
        //                 }
        //             },
        //             shortLine
        //         );
        //         // Diagonal lines are buggy at the moment
        //         makeLineTestCase(
        //             {
        //                 "diagonal-outline-10px-2px": {
        //                     lineWidth: "10px",
        //                     color: "#0b97c4",
        //                     outlineWidth: "2px",
        //                     outlineColor: "#7f7"
        //                 },
        //                 "diagonal-outline-10px-2px-rgba": {
        //                     lineWidth: "10px",
        //                     color: "#0b97c470",
        //                     outlineWidth: "2px",
        //                     outlineColor: "#7f7"
        //                 }
        //             },
        //             diagonalLine
        //         );
        //     });
        // });
        describe("text from lines", function() {
            mapViewFeaturesRenderingTest(`line-text-basic`, {
                width: 200,
                height: 200,
                geoJson: {
                    type: "FeatureCollection",
                    features: [
                        // tested horizontal line
                        straightLine,
                        referenceBackground
                    ]
                },
                theme: {
                    ...themeTextSettings,
                    styles: {
                        geojson: [
                            referenceBackroundStyle,
                            {
                                when: "$geometryType == 'line'",
                                technique: "solid-line",
                                attr: {
                                    color: "#E3D49A",
                                    outlineColor: "#3A4C69",
                                    lineWidth: 40,
                                    outlineWidth: 10
                                }
                            },
                            {
                                when: "$geometryType == 'line'",
                                technique: "text",
                                attr: {
                                    text: "Test",
                                    color: "#2f3",
                                    backgroundColor: "#cfe",
                                    size: 20,
                                    backgroundSize: 5,
                                    fontStyle: "Bold",
                                    vAlignment: "Above"
                                }
                            }
                        ]
                    }
                }
            });
        });
    });
    describe("polygon features", function() {
        const lights: Light[] = [
            {
                type: "ambient",
                color: "#FFFFFF",
                name: "ambientLight",
                intensity: 0.5
            },
            {
                type: "directional",
                color: "#FFFFFF",
                name: "light1",
                intensity: 0.5,
                direction: {
                    x: -5,
                    y: -2,
                    z: 10
                }
            }
        ];
        const rectangle: Feature = {
            // sample rectangular polygon
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0.004, 0.002],
                        [-0.004, 0.002],
                        [-0.004, -0.002],
                        [0.004, -0.002]
                    ]
                ]
            },
            properties: {
                kind: "mall",
                height: 200
            }
        };

        function makePolygonTestCases<T extends FillStyle | ExtrudedPolygonStyle>(
            technique: "fill" | "extruded-polygon",
            testCases: {
                [name: string]: T["attr"];
            },
            options?: Partial<GeoJsonMapViewRenderingTestOptions>
        ) {
            let extraFeatures: Feature[] = [];
            if (options && options.geoJson) {
                extraFeatures =
                    options.geoJson.type === "FeatureCollection" ? options.geoJson.features : [];
                options = { ...options };
                delete options.geoJson;
            }

            // tslint:disable-next-line:forin
            for (const testCase in testCases) {
                const attr: T["attr"] = testCases[testCase]!;

                mapViewFeaturesRenderingTest(`polygon-styling-${testCase}`, {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [
                            // tested horizontal line
                            rectangle,
                            referenceBackground,
                            ...extraFeatures
                        ]
                    },
                    theme: {
                        lights,
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'polygon'",
                                    technique: technique as any,
                                    attr: attr as any
                                }
                            ]
                        }
                    },
                    ...options
                });
            }
        }
        // describe("fill technique", function() {
        //     describe("no outline", function() {
        //         makePolygonTestCases("fill", {
        //             fill: { color: "#0b97c4" },
        //             "fill-rgba": { color: "#0b97c470" }
        //         });
        //     });
        //     describe("with outline", function() {
        //         makePolygonTestCases("fill", {
        //             // all tests are buggy ? because all outlines have 1px width
        //             "fill-outline-200m": { color: "#0b97c4", lineColor: "#7f7", lineWidth: 200 },
        //             "fill-rgba-outline-200m": {
        //                 color: "#0b97c470",
        //                 lineColor: "#7f7",
        //                 lineWidth: 200
        //             },
        //             "fiil-rgba-outline-rgba-200m": {
        //                 color: "#0b97c470",
        //                 lineColor: "#7f77",
        //                 lineWidth: 200
        //             }

        //             // TODO: not supported by typings
        //             // "rect-rgba-outline-rgba-5px": {
        //             //     color: "#0b97c470",
        //             //     lineColor: "#7f77",
        //             //     lineWidth: "5px"
        //             // }
        //         });
        //     });
        // });
        describe("standard technique", function() {
            mapViewFeaturesRenderingTest(
                `polygon-standard-texture`,
                {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [rectangle, referenceBackground]
                    },
                    theme: {
                        lights,
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'polygon'",
                                    technique: "standard",
                                    attr: {
                                        color: "#ffffff",
                                        map: "../dist/resources/wests_textures/paving.png",
                                        mapProperties: {
                                            repeatU: 10,
                                            repeatV: 10,
                                            wrapS: "repeat",
                                            wrapT: "repeat"
                                        },
                                        textureCoordinateType: TextureCoordinateType.TileSpace
                                    }
                                }
                            ]
                        }
                    }
                },
                async () => {
                    // we have no API to know when texture is already loaded
                    return new Promise(resolve => setTimeout(resolve, 500));
                }
            );
            mapViewFeaturesRenderingTest(
                `polygon-standard-texture-transparent`,
                {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [rectangle, referenceBackground]
                    },
                    theme: {
                        lights,
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'polygon'",
                                    technique: "standard",
                                    attr: {
                                        color: "#ffffff",
                                        opacity: 0.5,
                                        map: "../dist/resources/wests_textures/paving.png",
                                        mapProperties: {
                                            repeatU: 10,
                                            repeatV: 10,
                                            wrapS: "repeat",
                                            wrapT: "repeat"
                                        },
                                        textureCoordinateType: TextureCoordinateType.TileSpace
                                    }
                                }
                            ]
                        }
                    }
                },
                async () => {
                    // we have no API to know when texture is already loaded
                    return new Promise(resolve => setTimeout(resolve, 500));
                }
            );
        });

        describe("extruded-polygon technique", function() {
            const tower: Feature = {
                // sample polygon, that is smaller and higher than previous one
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [0.002, 0.001],
                            [-0.002, 0.001],
                            [-0.002, -0.001],
                            [0.002, -0.001],
                            [0.002, 0.001]
                        ]
                    ]
                },
                properties: {
                    kind: "tower",
                    height: 400
                }
            };
            const viewOptions = {
                margin: 0.3,
                lookAt: {
                    tilt: 35,
                    azimuth: 30
                }
            };
            describe("flat", function() {
                makePolygonTestCases(
                    "extruded-polygon",
                    {
                        "extruded-polygon-flat": { color: "#0b97c4", height: 0 },
                        "extruded-polygon-flat-rgba": { color: "#0b97c470", height: 0 },
                        "extruded-polygon-flat-rgba-outline": {
                            color: "#0b97c470",
                            height: 0,
                            lineWidth: 1,
                            lineColor: "#aaa"
                        }
                    },
                    viewOptions
                );
            });
            describe("3d", function() {
                makePolygonTestCases(
                    "extruded-polygon",
                    {
                        "extruded-polygon-3d": { color: "#0b97c4" },
                        "extruded-polygon-3d-rgba": {
                            color: "#0b97c480"
                        },
                        "extruded-polygon-3d-rgba-outline": {
                            color: "#0b97c480",
                            lineWidth: 1,
                            lineColorMix: 0,
                            lineColor: "#7f7"
                        }
                    },
                    viewOptions
                );
            });
            describe("3d overlapping", function() {
                makePolygonTestCases(
                    "extruded-polygon",
                    {
                        "extruded-polygon-3d-overlap": { color: "#0b97c4" },
                        "extruded-polygon-3d-overlap-rgba": {
                            color: "#0b97c480"
                        },
                        "extruded-polygon-3d-overlap-rgba-outline": {
                            color: "#0b97c480",
                            lineWidth: 1,
                            lineColorMix: 0,
                            lineColor: "#7f7"
                        }
                    },
                    {
                        geoJson: {
                            type: "FeatureCollection",
                            features: [tower]
                        },
                        ...viewOptions
                    }
                );
            });
        });
    });
});
