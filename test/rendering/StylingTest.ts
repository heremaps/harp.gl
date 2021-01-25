/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    CirclesStyle,
    ExtrudedPolygonStyle,
    Feature,
    FeatureCollection,
    FillStyle,
    GeometryCollection,
    Light,
    PoiStyle,
    SolidLineStyle,
    Style,
    TextTechniqueStyle,
    TextureCoordinateType,
    Theme
} from "@here/harp-datasource-protocol";
import { FeaturesDataSource } from "@here/harp-features-datasource";
import { GeoBox, OrientedBox3, ProjectionType } from "@here/harp-geoutils";
import { LookAtParams, MapAnchor, MapView, MapViewEventNames } from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/index-worker";
import { getPlatform, RenderingTestHelper, TestOptions, waitForEvent } from "@here/harp-test-utils";
import { getReferenceImageUrl } from "@here/harp-test-utils/lib/rendering/ReferenceImageLocator";
import { getOptionValue } from "@here/harp-utils";
import { VectorTileDecoder } from "@here/harp-vectortile-datasource/index-worker";
import { assert } from "chai";
import * as THREE from "three";

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
    testFun: (canvas: HTMLCanvasElement) => Promise<void>,
    cleanupFun?: () => void
) {
    const commonTestOptions = { module: "harp.gl" };
    const imageUrl = getReferenceImageUrl({ ...commonTestOptions, platform: getPlatform(), name });

    RenderingTestHelper.cachedLoadImageData(imageUrl).catch(_ => {
        // We can ignore error here, as _if_ this file was really needed, then test
        // will try to resolve this promise and report failure in test context.
    });
    it(name, async function () {
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
            if (cleanupFun !== undefined) {
                cleanupFun();
            }
            if (canvas !== undefined) {
                canvas.width = 0;
                canvas.height = 0;
                canvas = undefined!;
            }
        }
    });
}

function mapViewFitGeoBox(
    mapView: MapView,
    geoBox: GeoBox,
    margin: number = 0.1
): Partial<LookAtParams> {
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
    const distance = height * (1 + margin);

    boundingBox.getCenter(tmpVec3);
    const target = mapView.projection.unprojectPoint(tmpVec3);
    return {
        target,
        distance,
        tilt: 0,
        heading: 0
    };
}

interface GeoJsonMapViewRenderingTestOptions extends RenderingTestOptions {
    theme: Theme;
    geoJson: FeatureCollection | GeometryCollection | Feature;
    margin?: number;
    lookAt?: Partial<LookAtParams>;

    /**
     * Add small grid 4x4 to center of map with each cell of this size in world units.
     */
    grid?: number;
}

function mapViewFeaturesRenderingTest(
    name: string,
    options: GeoJsonMapViewRenderingTestOptions,
    testFun?: (mapView: MapView, dataSource: FeaturesDataSource) => Promise<void>
) {
    let mapView: MapView | undefined;
    baseRenderingTest(
        name,
        options,
        async function (canvas) {
            //document.body.appendChild(canvas);
            mapView = new MapView({
                canvas,
                theme: options.theme ?? {},
                preserveDrawingBuffer: true,
                disableFading: true,
                pixelRatio: 1
            });
            mapView.animatedExtrusionHandler.enabled = false;
            const dataSource = new FeaturesDataSource({
                styleSetName: "geojson",
                geojson: options.geoJson,
                decoder: new VectorTileDecoder(),
                tiler: new GeoJsonTiler(),
                gatherFeatureAttributes: true
            });
            mapView.addDataSource(dataSource);

            const geoBox = dataSource.getGeoBox()!;
            assert.isDefined(geoBox);

            const defaultLookAt = mapViewFitGeoBox(
                mapView,
                geoBox,
                getOptionValue(options.margin, 0.15)
            );

            const lookAt: LookAtParams = { ...defaultLookAt, ...options.lookAt } as any;

            mapView.lookAt(lookAt);
            if (options.grid !== undefined) {
                const gridDivisions = 4;
                const gridSize = options.grid * gridDivisions;

                const position = geoBox.center;
                const box = new OrientedBox3();
                mapView.projection.localTangentSpace(position, box);

                const grid = new THREE.GridHelper(gridSize, gridDivisions, 0xff0000, 0x00ff00);
                grid.geometry.rotateX(Math.PI / 2);
                (grid as MapAnchor).anchor = position;
                grid.setRotationFromMatrix(box.getRotationMatrix());
                mapView.mapAnchors.add(grid);
            }

            mapView.update();
            if (testFun !== undefined) {
                await testFun(mapView, dataSource);
            } else {
                await waitForEvent(mapView, MapViewEventNames.FrameComplete);
            }
            // Don't dispose mapView yet b/c the context will be lost since three.js 0.115
            // when WebGLRenderer.dispose is called (i.e. actual IBCT image will be empty).
        },
        () => {
            if (mapView !== undefined) {
                mapView.dispose();
                mapView = undefined!;
            }
        }
    );
}

describe("MapView Styling Test", function () {
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
    const referenceBackroundStyle: Style = {
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
                url: "../dist/resources/fonts/Default_FontCatalog.json"
            }
        ],
        images: {
            "my-marker-icon": {
                url:
                    "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDIyLjEuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHdpZHRoPSI0OHB4IiBoZWlnaHQ9IjQ4cHgiIHZlcnNpb249IjEuMSIgaWQ9Imx1aS1pY29uLWRlc3RpbmF0aW9ucGluLW9uZGFyay1zb2xpZC1sYXJnZSIKCSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDQ4IDQ4IgoJIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDQ4IDQ4IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPGc+Cgk8ZyBpZD0ibHVpLWljb24tZGVzdGluYXRpb25waW4tb25kYXJrLXNvbGlkLWxhcmdlLWJvdW5kaW5nLWJveCIgb3BhY2l0eT0iMCI+CgkJPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTQ3LDF2NDZIMVYxSDQ3IE00OCwwSDB2NDhoNDhWMEw0OCwweiIvPgoJPC9nPgoJPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiNmZmZmZmYiIGQ9Ik0yNCwyQzEzLjg3MDgsMiw1LjY2NjcsMTAuMTU4NCw1LjY2NjcsMjAuMjIzMwoJCWMwLDUuMDMyNSwyLjA1MzMsOS41ODg0LDUuMzcxNywxMi44ODgzTDI0LDQ2bDEyLjk2MTctMTIuODg4M2MzLjMxODMtMy4zLDUuMzcxNy03Ljg1NTgsNS4zNzE3LTEyLjg4ODMKCQlDNDIuMzMzMywxMC4xNTg0LDM0LjEyOTIsMiwyNCwyeiBNMjQsMjVjLTIuNzY1LDAtNS0yLjIzNS01LTVzMi4yMzUtNSw1LTVzNSwyLjIzNSw1LDVTMjYuNzY1LDI1LDI0LDI1eiIvPgo8L2c+Cjwvc3ZnPgo=",
                preload: true
            }
        },
        imageTextures: [
            {
                name: "my-marker-icon",
                image: "my-marker-icon"
            }
        ]
    };

    describe("point features", function () {
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
        function makePointPoiTestCases(
            testCases: { [name: string]: PoiStyle["attr"] },
            options?: Partial<GeoJsonMapViewRenderingTestOptions>
        ) {
            for (const testCase in testCases) {
                const attr: PoiStyle["attr"] = testCases[testCase]!;
                mapViewFeaturesRenderingTest(`poi-styling-${testCase}`, {
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
                        clearColor: "#a0a0a0",
                        styles: {
                            geojson: [
                                referenceBackroundStyle,
                                {
                                    when: "$geometryType == 'point'",
                                    technique: "labeled-icon",
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

        describe("text", function () {
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

        describe("poi", function () {
            makePointPoiTestCases(
                {
                    "poi-basic-icon-only": {
                        imageTexture: "my-marker-icon",
                        size: 10,
                        screenHeight: 20,
                        screenWidth: 20,
                        text: "",
                        iconBrightness: 0.7
                    },
                    "poi-basic-text-only": {
                        color: "#fe09",
                        size: 16,
                        screenHeight: 20,
                        screenWidth: 20
                    },
                    "poi-basic-both": {
                        color: "#fe0",
                        size: 16,
                        imageTexture: "my-marker-icon",
                        screenHeight: 20,
                        screenWidth: 20,
                        iconYOffset: 16,
                        iconColor: "#e22"
                    }
                },
                {
                    margin: 0.1
                }
            );
        });

        describe("circles", function () {
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
    describe("line features", function () {
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
            for (const testCase in testCases) {
                for (const clipping of [true, false]) {
                    const postfix = clipping === true ? "" : "-no-clipping";
                    const attr: SolidLineStyle["attr"] = JSON.parse(
                        JSON.stringify(testCases[testCase]!)
                    );
                    attr!.clipping = clipping;
                    mapViewFeaturesRenderingTest(`solid-line-styling-${testCase}${postfix}`, {
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
                        // grid: 100
                    });
                }
            }
        }

        describe("solid-line technique", function () {
            describe("basic", function () {
                makeLineTestCase({
                    "basic-100m": { lineWidth: 100, color: "#0b97c4" },
                    "basic-dash-100m": {
                        lineWidth: 100,
                        color: "#0b97c4",
                        dashSize: 100,
                        gapSize: 100
                    },
                    "basic-dash-10px-world-ppi-scale": {
                        lineWidth: ["world-ppi-scale", 10],
                        color: "#0b97c4",
                        dashSize: ["world-ppi-scale", 10],
                        gapSize: ["world-ppi-scale", 10]
                    },
                    "basic-dash-10px-string": {
                        lineWidth: "10px",
                        color: "#0b97c4",
                        dashSize: "10px",
                        gapSize: "10px"
                    },
                    "basic-100m-rgba": { lineWidth: 100, color: "#0b97c470" },
                    "basic-100m-rgba-square": {
                        lineWidth: 100,
                        color: "#0b97c470",
                        caps: "Square"
                    },
                    "basic-100m-rgba-triangle-out": {
                        lineWidth: 100,
                        color: "#0b97c470",
                        caps: "TriangleIn"
                    },
                    "basic-100m-rgba-trianglein": {
                        lineWidth: 100,
                        color: "#0b97c470",
                        caps: "TriangleOut"
                    },
                    "basic-100m-rgba-none": { lineWidth: 100, color: "#0b97c470", caps: "None" },
                    "basic-10px-rgba": { lineWidth: "10px", color: "#0b97c470" }
                });
                // Short line that ends on tile border
                makeLineTestCase(
                    {
                        "short-100m": { lineWidth: 100, color: "#0b97c4" },
                        "short-100m-rgba": { lineWidth: 100, color: "#0b97c470" },
                        "short-100m-rgba-square": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "Square"
                        },
                        "short-100m-rgba-triangle-out": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "TriangleIn"
                        },
                        "short-100m-rgba-trianglein": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "TriangleOut"
                        },
                        "short-100m-rgba-none": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "None"
                        },
                        "short-10px-rgba": { lineWidth: "10px", color: "#0b97c470" }
                    },
                    shortLine
                );
                // Diagonal lines are buggy at the moment
                makeLineTestCase(
                    {
                        "diagonal-100m": { lineWidth: 100, color: "#0b97c4" },
                        "diagonal-dash-100m": {
                            lineWidth: 100,
                            color: "#0b97c4",
                            dashSize: 80,
                            gapSize: 80
                        },
                        "diagonal-100m-rgba": { lineWidth: 100, color: "#0b97c470" },
                        "diagonal-100m-rgba-square": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "Square"
                        },
                        "diagonal-100m-rgba-triangle-out": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "TriangleIn"
                        },
                        "diagonal-100m-rgba-trianglein": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "TriangleOut"
                        },
                        "diagonal-100m-rgba-none": {
                            lineWidth: 100,
                            color: "#0b97c470",
                            caps: "None"
                        },
                        "diagonal-10px-rgba": { lineWidth: "10px", color: "#0b97c470" }
                    },
                    diagonalLine
                );
            });

            describe("with outline", function () {
                makeLineTestCase({
                    "outline-10px-2px": {
                        // BUGGY ?
                        lineWidth: "10px",
                        color: "#0b97c4",
                        outlineWidth: "2px",
                        outlineColor: "#7f7"
                    },
                    "outline-10px-2px-rgba": {
                        lineWidth: "10px",
                        color: "#0b97c470",
                        outlineWidth: "2px",
                        outlineColor: "#7f7"
                    }
                });
                // Short line that end on tile border
                makeLineTestCase(
                    {
                        "short-outline-10px-2px": {
                            // BUGGY ?
                            lineWidth: "10px",
                            color: "#0b97c4",
                            outlineWidth: "2px",
                            outlineColor: "#7f7"
                        },
                        "short-outline-10px-2px-rgba": {
                            lineWidth: "10px",
                            color: "#0b97c470",
                            outlineWidth: "2px",
                            outlineColor: "#7f7"
                        }
                    },
                    shortLine
                );
                // Diagonal lines are buggy at the moment
                makeLineTestCase(
                    {
                        "diagonal-outline-10px-2px": {
                            lineWidth: "10px",
                            color: "#0b97c4",
                            outlineWidth: "2px",
                            outlineColor: "#7f7"
                        },
                        "diagonal-outline-10px-2px-rgba": {
                            lineWidth: "10px",
                            color: "#0b97c470",
                            outlineWidth: "2px",
                            outlineColor: "#7f7"
                        }
                    },
                    diagonalLine
                );
            });
        });
        describe("text from lines", function () {
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
                                    outlineWidth: 10,
                                    clipping: true
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
    describe("polygon features", function () {
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
        const rectangle1: Feature = {
            // sample rectangular polygon
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0.001, 0.001],
                        [-0.004, 0.001],
                        [-0.004, -0.002],
                        [0.001, -0.002],
                        [0.001, 0.001]
                    ]
                ]
            },
            properties: {
                name: "Awesome Building",
                kind: "building",
                height: 200
            }
        };
        const rectangle2: Feature = {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0.001, 0.002],
                        [0.004, 0.002],
                        [0.004, -0.002],
                        [0.001, -0.002]
                    ]
                ]
            },
            properties: {
                name: "Not So Awesome Building",
                kind: "building",
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

            for (const testCase in testCases) {
                const attr: T["attr"] = testCases[testCase]!;

                mapViewFeaturesRenderingTest(`polygon-styling-${testCase}`, {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [
                            // tested horizontal line
                            rectangle1,
                            rectangle2,
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
        describe("fill technique", function () {
            describe("no outline", function () {
                makePolygonTestCases("fill", {
                    fill: { color: "#0b97c4" },
                    "fill-rgba": { color: "#0b97c470" }
                });
            });
            describe("with outline", function () {
                makePolygonTestCases("fill", {
                    // all tests are buggy ? because all outlines have 1px width
                    "fill-outline-200m": { color: "#0b97c4", lineColor: "#7f7", lineWidth: 200 },
                    "fill-rgba-outline-200m": {
                        color: "#0b97c470",
                        lineColor: "#7f7",
                        lineWidth: 200
                    },
                    "fill-rgba-outline-rgba-200m": {
                        color: "#0b97c470",
                        lineColor: "#7f77",
                        lineWidth: 200
                    },
                    "fill-outline-disabled": {
                        color: "#0b97c4",
                        lineColor: "#7f7",
                        lineWidth: 200,
                        enabled: false
                    },
                    "fill-outline-partially-disabled": {
                        color: "#0b97c4",
                        lineColor: "#7f7",
                        lineWidth: 200,
                        enabled: ["match", ["get", "name"], "Awesome Building", true, false]
                    }
                    // TODO: not supported by typings
                    // "rect-rgba-outline-rgba-5px": {
                    //     color: "#0b97c470",
                    //     lineColor: "#7f77",
                    //     lineWidth: "5px"
                    // }
                });
            });
        });
        describe("standard technique", function () {
            mapViewFeaturesRenderingTest(
                `polygon-standard-texture`,
                {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [rectangle1, rectangle2, referenceBackground]
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
                    return await new Promise(resolve => setTimeout(resolve, 500));
                }
            );
            mapViewFeaturesRenderingTest(
                `polygon-standard-texture-transparent`,
                {
                    geoJson: {
                        type: "FeatureCollection",
                        features: [rectangle1, referenceBackground]
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
                    return await new Promise(resolve => setTimeout(resolve, 500));
                }
            );
        });

        describe("extruded-polygon technique", function () {
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
                    heading: 30
                }
            };
            describe("flat", function () {
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
            describe("3d", function () {
                makePolygonTestCases(
                    "extruded-polygon",
                    {
                        "extruded-polygon-3d": { color: "#0b97c4" },
                        "extruded-polygon-3d-rgba": {
                            color: "#0b97c480"
                        },
                        "extruded-polygon-3d-rgba-disabled": {
                            color: "#0b97c480",
                            enabled: false
                        },
                        "extruded-polygon-3d-rgba-outline": {
                            color: "#0b97c480",
                            lineWidth: 1,
                            lineColorMix: 0,
                            lineColor: "#7f7"
                        },
                        "extruded-polygon-3d-rgba-outline-disabled": {
                            color: "#0b97c480",
                            lineWidth: 1,
                            lineColorMix: 0,
                            lineColor: "#7f7",
                            enabled: false
                        },
                        "extruded-polygon-3d-rgba-outline-partialy-disabled": {
                            color: "#0b97c480",
                            lineWidth: 1,
                            lineColorMix: 0,
                            lineColor: "#7f7",
                            enabled: ["match", ["get", "name"], "Awesome Building", true, false]
                        }
                    },
                    viewOptions
                );
            });
            describe("3d overlapping", function () {
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
