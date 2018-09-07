/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { GeoCoordinates } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { WebTileDataSource } from "@here/webtile-datasource";
import { appCode, appId } from "../config";

export namespace WebTileDataSourceExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: "resources/theme.json"
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        MapControls.create(sampleMapView);

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
     * https://1.base.maps.cit.api.here.com/maptile/2.1/maptile/newest/normal.day/${level}/${column}/${row}/512/png8?app_id=${appId}&app_code=${appCode}
     * ```
     *
     * A [[WebTileDataSource]] is created with specified applications' appId and appCode passed
     * as [[WebTileDataSourceOptions]]
     * ```typescript
     * [[include:vislib_datasource_webtile_1.ts]]
     * ```
     * Then added to the [[MapView]]
     * ```typescript
     * [[include:vislib_datasource_webtile_2.ts]]
     * ```
     */
    // tslint:enable:max-line-length

    const mapView = initializeMapView("mapCanvas");

    // snippet:vislib_datasource_webtile_1.ts
    const webTileDataSource = new WebTileDataSource({
        appId,
        appCode
    });
    // end:vislib_datasource_webtile_1.ts

    mapView.geoCenter = new GeoCoordinates(46.8182, 8.2275);

    // snippet:vislib_datasource_webtile_2.ts
    mapView.addDataSource(webTileDataSource);
    // end:vislib_datasource_webtile_2.ts
}
