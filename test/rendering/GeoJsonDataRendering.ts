/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { GeoJson, Light, StyleSet, Theme } from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView, MapViewEventNames } from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/index-worker";
import { OmvDataSource } from "@here/harp-omv-datasource";
import { OmvTileDecoder } from "@here/harp-omv-datasource/lib/OmvDecoder";
import { RenderingTestHelper, waitForEvent } from "@here/harp-test-utils";
import { mergeWithOptions } from "@here/harp-utils";

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

    interface LookAtParams {
        latitute: number;
        longitude: number;
        distance: number;
        tilt: number;
        azimuth: number;
    }

    interface GeoJsoTestOptions {
        mochaTest: Mocha.Context;
        testImageName: string;
        theme: Theme;
        geoJson: string | GeoJson;

        lookAt?: Partial<LookAtParams>;
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

        const defaultLookAt: LookAtParams = {
            latitute: 53.3,
            longitude: 14.6,
            distance: 200000,
            tilt: 0,
            azimuth: 0
        };

        const lookAt = mergeWithOptions(defaultLookAt, options.lookAt);

        mapView.lookAt(
            new GeoCoordinates(lookAt.latitute, lookAt.longitude),
            lookAt.distance,
            lookAt.tilt,
            lookAt.azimuth
        );
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
                { tiler: new GeoJsonTiler() }
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
                azimuth: 30
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
                azimuth: 30
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
                azimuth: 30
            }
        });
    });
});
