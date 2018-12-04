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
 * This is a simple example showcasing only the data loading part with the
 * help of customized [[GeoJsonDataSource]] and [[DataProvider]] to a
 * [[MapView]] object.
 *
 * For data source we use an `italy.json` file that represents raw, untiled GeoJSON
 * data in the format described at {@link http://geojson.org/}.
 *
 * First step is to setup the [[MapView]]:
 * ```typescript
 * [[include:datasource_geojson_load1.ts]]
 * ```
 *
 * As you can see in the snippet above, we call the `initializeMapViewDataSource`
 * function with a given [[MapView]] as it's only argument.
 *
 * ```typescript
 * [[include:datasource_geojson_load2.ts]]
 * ```
 *
 * In this example we use `StaticGeoJsonDataSource` and `StaticDataProvider` which are
 * wrappers of [[GeoJsonDataSource]] and [[DataProvider]] accordingly. The idea was
 * to implement a [[DataSource]] that will work with raw, untiled GeoJSON data that is retreived
 * from a local `italy.json` file and assigned as an `italyData` variable.
 * ```typescript
 * [[include:datasource_style_static.ts]]
 * ```
 * `StaticGeoJsonDataSource` in this case was made as an optimization that keeps
 * everything in one tile with `mortonCode: 1`.
 *
 */
export namespace GeoJsonLoadExample {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
        </style>
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

    // snippet:datasource_style_static.ts
    class StaticGeoJsonDataSource extends GeoJsonDataSource {
        // rendering optimization
        shouldRender(zoomLevel: number, tileKey: TileKey) {
            return tileKey.mortonCode() === 1;
        }

        // return GeoJSONTile only if mortonCode is 1, else = nothing
        getTile(tileKey: TileKey) {
            if (tileKey.mortonCode() !== 1) {
                return undefined;
            }
            return super.getTile(tileKey);
        }
    }

    class StaticDataProvider implements DataProvider {
        // This is required to work
        ready(): boolean {
            return true;
        }
        async connect(): Promise<void> {
            //not needed
        }

        // Returns italyData json object.
        async getTile(): Promise<{}> {
            return italyData;
        }
    }
    // end:datasource_style_static.ts

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
    // snippet:datasource_geojson_load1.ts
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
    // end:datasource_geojson_load1.ts

    // snippet:datasource_geojson_load2.ts
    function initializeMapViewDataSource(mapViewUsed: MapView) {
        const staticDataProvider = new StaticDataProvider();

        const geoJsonDataSource = new StaticGeoJsonDataSource({
            dataProvider: staticDataProvider,
            name: "geojson"
        });

        mapViewUsed.addDataSource(geoJsonDataSource).then(() => {
            geoJsonDataSource.setStyleSet(orangeStyle);
        });

        mapViewUsed.update();
    }
    // end:datasource_geojson_load2.ts
}
