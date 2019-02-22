/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { WebTileDataSource } from "@here/harp-webtile-datasource";
import { appCode, appId } from "../config";

export namespace WebTileDataSourceExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/berlin_base.json"
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        MapControls.create(sampleMapView);
        CopyrightElementHandler.install("copyrightNotice", sampleMapView);

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        return sampleMapView;
    }

    // tslint:disable:max-line-length
    /**
     * A simple example using the webtile data source. Tiles are retrieved from
     * ```typescript
     * https://1.base.maps.api.here.com/maptile/2.1/maptile/newest/normal.day/${level}/${column}/${row}/512/png8?app_id=${appId}&app_code=${appCode}
     * ```
     *
     * A [[WebTileDataSource]] is created with specified applications' appId and appCode passed
     * as [[WebTileDataSourceOptions]]
     * ```typescript
     * [[include:harp_gl_datasource_webtile_1.ts]]
     * ```
     * Then added to the [[MapView]]
     * ```typescript
     * [[include:harp_gl_datasource_webtile_2.ts]]
     * ```
     */
    // tslint:enable:max-line-length

    const mapView = initializeMapView("mapCanvas");

    // snippet:harp_gl_datasource_webtile_1.ts
    const webTileDataSource = new WebTileDataSource({
        appId,
        appCode
    });
    // end:harp_gl_datasource_webtile_1.ts

    mapView.geoCenter = new GeoCoordinates(40.702, -74.01154);

    // snippet:harp_gl_datasource_webtile_2.ts
    mapView.addDataSource(webTileDataSource);
    // end:harp_gl_datasource_webtile_2.ts
}
