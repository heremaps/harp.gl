/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet } from "@here/harp-datasource-protocol";
import { GeoJsonDataSource } from "@here/harp-geojson-datasource";
import { GeoCoordinates, TileKey } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import * as italyData from "../resources/italy.json";

/**
 * This example showcases how the inspection (picking) of GeoJSON works. This example
 * is based on the datasource/geojson example, so if you need some more details on
 * how to set up [[MapView]] and get data from a [[DataSource]], please read it first.
 *
 * The first thing we should do is to set `enableRoadPicking: true` inside the
 * [[MapViewOptions]] parameters object.
 * ```typescript
 * [[include:datasource_geojson_picking1.ts]]
 * ```
 *
 * Now, let's write an event that fires when the user clicks the map canvas:
 * ```typescript
 * [[include:datasource_geojson_picking2.ts]]
 * ```
 *
 * All the data handling is covered by the `handlePick` function. Here we find the
 * intersected objects, pick the first (nearest) one in the array and display its
 * data inside the helper box
 * ```typescript
 * [[include:datasource_geojson_picking3.ts]]
 * ```
 *
 */
export namespace GeoJsonPickingExample {
    document.body.innerHTML += `
        <style>
            #mouse-picked-result{
                position:absolute;
                bottom:5px;
                border-radius: 5px;
                margin-left:10px;
                padding: 9px 12px;
                background: #37afaa;
                display: inline-block;
                visibility: hidden;
            }
            #mapCanvas {
              top: 0;
            }
        </style>

        <pre id="mouse-picked-result"></pre>
    `;

    const orangeStyle: StyleSet = [
        {
            description: "geoJson polygon",
            when: "type == 'polygon'",
            renderOrder: 1000,
            technique: "fill",
            attr: {
                color: "#ffff00",
                transparent: true,
                opacity: 0.5
            }
        }
    ];

    /**
     * Outputs a single tile that has mortonCode = 1.
     */
    class StaticGeoJsonDataSource extends GeoJsonDataSource {
        shouldRender(zoomLevel: number, tileKey: TileKey) {
            return tileKey.mortonCode() === 1;
        }

        getTile(tileKey: TileKey) {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return super.getTile(tileKey);
        }
    }

    /**
     * Provides a GeoJSON data stored in `italyData` variable.
     */
    class StaticDataProvider implements DataProvider {
        ready(): boolean {
            return true;
        }

        async connect(): Promise<void> {
            //not needed
        }

        async getTile(): Promise<{}> {
            return italyData;
        }
    }

    initializeMapView("mapCanvas");

    // snippet:datasource_geojson_picking3.ts
    const element = document.getElementById("mouse-picked-result") as HTMLPreElement;

    function handlePick(mapViewUsed: MapView, x: number, y: number) {
        // get an array of intersection results from MapView
        const intersectionResults = mapViewUsed.intersectMapObjects(x, y);

        if (intersectionResults.length > 0) {
            // Get the first (or nearest) result
            const firstResult = intersectionResults[0];

            if (firstResult !== undefined) {
                const objectInfo = firstResult.userData;

                if (objectInfo !== undefined) {
                    // Show helper box
                    element.style.visibility = "visible";
                    // Display userData [only nearest result] inside of helper box
                    element.innerHTML = JSON.stringify(objectInfo, undefined, 2);
                }
            }
        }
    }
    // end:datasource_geojson_picking3.ts

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeMapView(id: string) {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // snippet:datasource_geojson_picking1.ts
        const mapView = new MapView({
            canvas,
            theme: "resources/reducedNight.json",
            enableRoadPicking: true
        });
        // end:datasource_geojson_picking1.ts

        CopyrightElementHandler.install("copyrightNotice")
            .attach(mapView)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        mapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        mapView.geoCenter = new GeoCoordinates(16, -4, 0);

        MapControls.create(mapView);
        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        // snippet:datasource_geojson_picking2.ts
        canvas.addEventListener("mousedown", event => {
            handlePick(mapView, event.pageX, event.pageY);
        });
        // end:datasource_geojson_picking2.ts

        initializeMapViewDataSource(mapView);
    }

    function initializeMapViewDataSource(mapView: MapView) {
        const staticDataProvider = new StaticDataProvider();

        const geoJsonDataSource = new StaticGeoJsonDataSource({
            dataProvider: staticDataProvider,
            name: "geojson"
        });

        mapView.addDataSource(geoJsonDataSource).then(() => {
            geoJsonDataSource.setStyleSet(orangeStyle);
        });

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.MapzenV2,
            styleSetName: "tilezen",
            maxZoomLevel: 17
        });

        mapView.addDataSource(omvDataSource);
        mapView.update();
    }
}
