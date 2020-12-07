/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJsonTest } from "./utils/GeoJsonTest";
import { ThemeBuilder } from "./utils/ThemeBuilder";

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

describe("ScreenSpaceRendering Test", function() {
    const geoJsonTest = new GeoJsonTest();

    it("renders icon without text, if fontcatalog not found ", async function() {
        this.timeout(5000);

        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-no-text-icon",
            theme: new ThemeBuilder()
                .withInvalidFontCatalog()
                .withMarkerStyle()
                .build(),
            geoJson: {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: { text: "Marker" },
                        geometry: { type: "Point", coordinates: [14.6, 53.3] }
                    }
                ]
            },
            lookAt: { tilt: 80, zoomLevel: 19 },
            tileGeoJson: false
        });
    });

    it("renders interleaved icon and text", async function() {
        this.timeout(5000);

        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-interleaved-icon-text",
            theme: new ThemeBuilder()
                .withFontCatalog()
                .withMarkerStyle()
                .build(),
            geoJson: {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: {
                            text: "Marker0",
                            color: "red",
                            imageTexture: "red-icon",
                            renderOrder: 0
                        },
                        geometry: { type: "Point", coordinates: [14.6, 53.3] }
                    },
                    {
                        type: "Feature",
                        properties: {
                            text: "Marker1",
                            color: "green",
                            imageTexture: "green-icon",
                            renderOrder: 1
                        },
                        geometry: { type: "Point", coordinates: [14.6, 53.32] }
                    },
                    {
                        type: "Feature",
                        properties: {
                            text: "Marker2",
                            color: "blue",
                            imageTexture: "white-icon",
                            renderOrder: 2
                        },
                        geometry: { type: "Point", coordinates: [14.6, 53.28] }
                    }
                ]
            },
            lookAt: { tilt: 0, zoomLevel: 10 },
            tileGeoJson: false
        });
    });

    it("renders point using marker technique, with theme set to datasource", async function() {
        this.timeout(5000);

        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-point-after-theme-reset-in-datasource",
            theme: new ThemeBuilder().build(),
            geoJson: {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: { text: "Marker", renderOrder: 1 },
                        geometry: { type: "Point", coordinates: [14.6, 53.3] }
                    }
                ]
            },
            lookAt: { tilt: 0, zoomLevel: 10 },
            tileGeoJson: false,
            beforeFinishCallback: async mapView => {
                await mapView
                    .getDataSourceByName("geojson")
                    ?.setTheme({ styles: [ThemeBuilder.markerStyle] });
            }
        });
    });

    it("renders point using marker technique, after fontcatalog added in set theme", async function() {
        this.timeout(5000);
        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-point-after-font-added",
            theme: new ThemeBuilder().withMarkerStyle().build(),
            geoJson: {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: { text: "Marker", renderOrder: 1 },
                        geometry: { type: "Point", coordinates: [14.6, 53.3] }
                    }
                ]
            },
            lookAt: { tilt: 0, zoomLevel: 10 },
            tileGeoJson: false,
            beforeFinishCallback: async mapView => {
                await mapView
                    .getDataSourceByName("geojson")
                    ?.setTheme(new ThemeBuilder(true).withMarkerStyle().build());
                await mapView.setTheme(new ThemeBuilder().withFontCatalog().build());
            }
        });
    });

    it("renders point using marker technique, after theme reset", async function() {
        this.timeout(5000);
        await geoJsonTest.run({
            mochaTest: this,
            testImageName: "geojson-point-after-theme-reset",
            theme: new ThemeBuilder()
                .withMarkerStyle()
                .withFontCatalog()
                .build(),
            geoJson: {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        properties: { text: "Marker", renderOrder: 1, color: "blue" },
                        geometry: { type: "Point", coordinates: [14.6, 53.3] }
                    }
                ]
            },
            lookAt: { tilt: 0, zoomLevel: 10 },
            tileGeoJson: false,
            beforeFinishCallback: async mapView => {
                await mapView.setTheme(
                    new ThemeBuilder()
                        .withMarkerStyle()
                        .withFontCatalog()
                        .build()
                );
            }
        });
    });
});
