/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { GeoJson, StyleSet, Theme } from "@here/harp-datasource-protocol";
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
        heading: number;
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
            heading: 0
        };

        const lookAt = mergeWithOptions(defaultLookAt, options.lookAt);

        mapView.lookAt(
            new GeoCoordinates(lookAt.latitute, lookAt.longitude),
            lookAt.distance,
            lookAt.tilt,
            lookAt.heading
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
                    transparent: true,
                    opacity: 0.5
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-polygon-fill",
            theme: { styles: { geojson: greenStyle } },
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
                    transparent: true,
                    opacity: 0.5,
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-flat",
            theme: { styles: { geojson: greenStyle } },
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
                when: ["==", ["get", "$geometryType"], "polygon"],
                technique: "extruded-polygon",
                attr: {
                    vertexColors: false,
                    emissive: "#78858C",
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-with-height",
            theme: { styles: { geojson: ourStyle } },
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
                when: ["==", ["get", "$geometryType"], "polygon"],
                technique: "extruded-polygon",
                attr: {
                    vertexColors: true,
                    color: ["string", ["get", "color"], "#5050f0"],
                    emissiveIntensity: 0.85,
                    emissive: "#78858C",
                    lineWidth: 1,
                    lineColor: "#172023",
                    lineColorMix: 0.6
                }
            }
        ];

        await geoJsonTest({
            mochaTest: this,
            testImageName: "geojson-extruded-polygon-with-height-color",
            theme: { styles: { geojson: ourStyle } },
            geoJson: "../dist/resources/basic_polygon.json",
            lookAt: {
                tilt: 45,
                heading: 30
            }
        });
    });
});
