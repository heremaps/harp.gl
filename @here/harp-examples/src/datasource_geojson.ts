/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";

/**
 * This examples showcases how we can use the [[GeoJsonDataProvider]] class together with an
 * [[OmvDataSource]] to render tiled GeoJson data on top of [[MapView]].
 *
 * For data source we use an `italy.json` file that represents raw, untiled GeoJSON
 * data in the format described at {@link http://geojson.org/}.
 *
 * First step is to setup the [[MapView]]:
 * ```typescript
 * [[include:datasource_geojson0.ts]]
 * ```
 *
 * Then we create a [[GeoJsonDataProvider]] to plug into a [[OmvDataSource]], which will take care
 * tiling the GeoJson so it can be properly displayed on top of [[MapView]].
 *
 * ```typescript
 * [[include:datasource_geojson1.ts]]
 * ```
 */
export namespace GeoJsonExample {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
        </style>
    `;

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });

    mapView.addDataSource(omvDataSource);

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeMapView(id: string): MapView {
        // snippet:datasource_geojson0.ts
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
        // end:datasource_geojson0.ts

        // snippet:datasource_geojson1.ts
        // Create a [[GeoJsonDataProvider]] from a GeoJson URL and plug it into an OmvDataSource.
        const geoJsonDataProvider = new GeoJsonDataProvider(
            "italy",
            new URL("resources/italy.json", window.location.href)
        );
        const geoJsonDataSource = new OmvDataSource({
            dataProvider: geoJsonDataProvider,
            name: "geojson",
            styleSetName: "geojson"
        });
        sampleMapView.addDataSource(geoJsonDataSource);
        // end:datasource_geojson1.ts

        sampleMapView.update();

        return sampleMapView;
    }
}
