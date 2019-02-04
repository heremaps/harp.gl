/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet } from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates, TileKey } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";

/**
 * This example demonstrates how to use [[MapView]] map rendering SDK, fetching
 * data using the `StaticDataProvider` and [[StyleSet]] changing with the help of the
 * [[DataSource.setStyleSet]] method.
 *
 * At first, we need to setup the [[MapView]] and connect to data source.
 * ```typescript
 * [[include:datasource_style1.ts]]
 * ```
 *
 * Then we have to write a `updateGeoJsonStyleSet()` function that accepts both,
 * the [[MapView]] that we're going to work with, and the [[StyleSet]] array.
 * ```typescript
 * [[include:datasource_style2.ts]]
 * ```
 *
 * Finally, we can pass a spicific styleset or toggle between several stylesets
 * like in the following example:
 * ```typescript
 * [[include:datasource_style3.ts]]
 * ```
 */
export namespace GeoJsonStylingExample {
    document.body.innerHTML += `
        <style>
            #styleset-toggle{
                position: relative;
                background: #37afaa;
                display: inline-block;
                height: 34px;
                color: white;
                border: none;
                width: 100px;
                vertical-align: bottom;
                cursor: pointer;
                left: 20px;
                top: 20px;
            }
            #styleset-status {
              position: relative;
              display: inline-block;
              left: 35px;
              font-size: 12pt;
              color: white;
              font: 400 11px system-ui;
              top: 10px;
            }
            #mapCanvas {
              top: 0;
            }
        </style>

        <button id="styleset-toggle">Change StyleSet</button>
        <span id="styleset-status">Active StyleSet is: orangeStyle</span>
    `;

    const orangeStyle: StyleSet = [
        {
            description: "geoJson polygon",
            when: "$geometryType == 'polygon'",
            renderOrder: 1000,
            technique: "fill",
            attr: {
                color: "#ffff00",
                transparent: true,
                opacity: 0.5
            }
        }
    ];

    const greenStyle: StyleSet = [
        {
            description: "geoJson polygon",
            when: "$geometryType == 'polygon'",
            renderOrder: 1000,
            technique: "fill",
            attr: {
                color: "#00ff00",
                transparent: true,
                opacity: 0.5
            }
        }
    ];

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });

    mapView.addDataSource(omvDataSource);

    initializeStyleSetToggle();

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    // snippet:datasource_style1.ts
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const sampleMapView = new MapView({
            canvas,
            theme: "resources/reducedNight.json"
        });

        CopyrightElementHandler.install("copyrightNotice")
            .attach(sampleMapView)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        sampleMapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        sampleMapView.geoCenter = new GeoCoordinates(16, -4, 0);

        MapControls.create(sampleMapView);
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        initializeMapViewDataSource(sampleMapView);

        return sampleMapView;
    }
    // end:datasource_style1.ts

    function initializeMapViewDataSource(mapViewUsed: MapView) {
        const geoJsonDataProvider = new GeoJsonDataProvider(
            new URL("resources/italy.json", window.location.href)
        );
        const geoJsonDataSource = new OmvDataSource({
            dataProvider: geoJsonDataProvider,
            name: "geojson",
            styleSetName: "geojson"
        });

        mapViewUsed.addDataSource(geoJsonDataSource).then(() => {
            updateGeoJsonStyleSet(mapViewUsed, orangeStyle);
        });

        mapViewUsed.update();
    }

    // snippet:datasource_style2.ts
    let activeStyleSet: StyleSet;

    function updateGeoJsonStyleSet(mapViewUsed: MapView, styleSet: StyleSet) {
        activeStyleSet = styleSet;
        const geoJsonDataSource = mapViewUsed.getDataSourcesByStyleSetName("geojson")[0];

        if (geoJsonDataSource !== undefined) {
            geoJsonDataSource.setStyleSet(styleSet);
        }
    }
    // end:datasource_style2.ts

    /**
     * Initilizes StyleSet toggling process
     */
    function initializeStyleSetToggle() {
        const toggleElement = document.getElementById(
            "styleset-toggle"
        ) as HTMLButtonElement | null;

        const styleSetStatusElement = document.getElementById(
            "styleset-status"
        ) as HTMLSpanElement | null;

        if (toggleElement !== null && styleSetStatusElement !== null) {
            toggleElement.addEventListener("click", () => {
                // snippet:datasource_style3.ts
                updateGeoJsonStyleSet(
                    mapView,
                    activeStyleSet === orangeStyle ? greenStyle : orangeStyle
                );
                // end:datasource_style3.ts
                styleSetStatusElement.innerText = `Active StyleSet is: ${
                    activeStyleSet === orangeStyle ? "orangeStyle" : "greenStyle"
                }`;
            });
        }
    }
}
