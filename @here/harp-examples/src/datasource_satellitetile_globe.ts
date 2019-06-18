/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { WebTileDataSource } from "@here/harp-webtile-datasource";
import { appCode, appId } from "../config";

// tslint:disable:max-line-length
/**
 * A simple example using the webtile data source. Tiles are retrieved from
 * ```
 * https://1.base.maps.api.here.com/maptile/2.1/maptile/newest/normal.day/${level}/${column}/${row}/512/png8?app_id=${appId}&app_code=${appCode}
 * ```
 *
 * A [[WebTileDataSource]] is created with specified applications' appId and appCode passed
 * as [[WebTileDataSourceOptions]]
 * ```typescript
 * [[include:harp_gl_datasource_satellitetile_globe_1.ts]]
 * ```
 * Then added to the [[MapView]]
 * ```typescript
 * [[include:harp_gl_datasource_satellitetile_globe_2.ts]]
 * ```
 */
export namespace SatelliteTileDataSourceGlobeExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base_globe.json",
            projection: sphereProjection
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        MapControls.create(map);

        CopyrightElementHandler.install("copyrightNotice", map);

        // resize the mapView to maximum
        map.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        return map;
    }

    function main() {
        const mapView = initializeMapView("mapCanvas");

        // snippet:harp_gl_datasource_satellitetile_globe_1.ts
        const webTileDataSource = new WebTileDataSource({
            appId,
            appCode,
            tileBaseAddress: WebTileDataSource.TILE_AERIAL_SATELLITE
        });
        // end:harp_gl_datasource_satellitetile_globe_1.ts

        mapView.setCameraGeolocationAndZoom(new GeoCoordinates(40.702, -74.01154), 3.6);

        // snippet:harp_gl_datasource_satellitetile_globe_2.ts
        mapView.addDataSource(webTileDataSource);
        // end:harp_gl_datasource_satellitetile_globe_2.ts
    }

    main();
}
