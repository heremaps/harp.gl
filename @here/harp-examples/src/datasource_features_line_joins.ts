/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugTileDataSource } from "@here/harp-debug-datasource";
import { GeoCoordinates, webMercatorTilingScheme } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    GeoJsonDataProvider,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

import { apikey, copyrightInfo } from "../config";

/**
 * This example demonstrates how to render lines with different line joins.
 */
export namespace GeoJsonLineJoinsExample {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
        </style>
    `;

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new VectorTileDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        maxDataLevel: 17,
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        },
        copyrightInfo
    });

    mapView.addDataSource(omvDataSource);

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    // snippet:datasource_features_line_joins.ts
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const map = new MapView({
            canvas,
            theme: {
                // Create some lights
                lights: [
                    {
                        type: "ambient",
                        color: "#FFFFFF",
                        name: "ambientLight",
                        intensity: 0.9
                    },
                    {
                        type: "directional",
                        color: "#CCCBBB",
                        name: "light1",
                        intensity: 0.8,
                        direction: {
                            x: 1,
                            y: 5,
                            z: 0.5
                        }
                    },
                    {
                        type: "directional",
                        color: "#F4DB9C",
                        name: "light2",
                        intensity: 0.8,
                        direction: {
                            x: -1,
                            y: -3,
                            z: 1
                        }
                    }
                ],
                styles: {
                    geojson: [
                        {
                            when: ["==", ["geometry-type"], "LineString"],
                            renderOrder: 1000,
                            lineColor: "red",
                            technique: "solid-line",
                            joins: "Bevel",
                            lineWidth: "20px"
                        }
                    ]
                }
            },
            target: new GeoCoordinates(0, 0),
            zoomLevel: 3
        });

        CopyrightElementHandler.install("copyrightNotice").attach(map);

        const controls = new MapControls(map);

        // Add an UI.
        const ui = new MapControlsUI(controls, { projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        // Create a [[GeoJsonDataProvider]] from a GeoJson URL and plug it into an OmvDataSource.
        const geoJsonDataProvider = new GeoJsonDataProvider(
            "lines",
            new URL("resources/lines.json", window.location.href)
        );
        const geoJsonDataSource = new VectorTileDataSource({
            dataProvider: geoJsonDataProvider,
            name: "geojson",
            styleSetName: "geojson"
        });
        map.addDataSource(geoJsonDataSource);

        // Also visualize the tile borders:
        const debugDataSource = new DebugTileDataSource(webMercatorTilingScheme, "debug", 20);
        map.addDataSource(debugDataSource);

        map.update();

        return map;
    }
}
