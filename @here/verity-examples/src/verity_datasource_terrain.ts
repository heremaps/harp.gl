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
import { HRN } from "@here/hype";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { TerrainDataSource } from "@here/terrain-datasource";
import * as THREE from "three";
import { appCode, appId } from "../config";

export namespace TerrainDataSourceExample {
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

    /**
     * An example of using the terrain data source. The tiles are retrieved from the following HRN:
     * `hrn:here-dev:datastore:::bulovyat-mvt-test-1`;
     *
     * A [[TerrainDataSource]] is created using applications' appId and appCode passed as
     * [[TerrainDataSourceParameters]]
     *
     * ```typescript
     * [[include:vislib_terrain_datasource_webtile_0.ts]]
     * ```
     * Then it is added the [[MapView]]:
     * ```typescript
     * [[include:vislib_terrain_datasource_webtile_1.ts]]
     * ```
     */

    const mapView = initializeMapView("mapCanvas");

    // snippet:vislib_terrain_datasource_webtile_0.ts
    const terrainDataSource = new TerrainDataSource({
        hrn: HRN.fromString("hrn:here-dev:datastore:::bulovyat-mvt-test-1"),
        appId,
        appCode
    });
    // end:vislib_terrain_datasource_webtile_0.ts

    mapView.geoCenter = new GeoCoordinates(46.8182, 8.2275);

    mapView.camera.rotateX(THREE.Math.degToRad(45));

    // snippet:vislib_terrain_datasource_webtile_1.ts
    mapView.addDataSource(terrainDataSource);
    // end:vislib_terrain_datasource_webtile_1.ts
}
