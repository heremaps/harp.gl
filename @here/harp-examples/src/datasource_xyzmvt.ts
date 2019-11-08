/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

/**
 * MapView initialization sequence enables setting all the necessary elements on a map  and returns
 * a [[MapView]] object. Looking at the function's definition:
 *
 * ```typescript
 * function initializeMapView(id: string): MapView {
 * ```
 *
 * it can be seen that it accepts a string which holds an `id` of a DOM element to initialize the
 * map canvas within.
 *
 * ```typescript
 * [[include:harp_gl_datasource_xyzmvt_example_0.ts]]
 * ```
 *
 * During the initialization, canvas element with a given `id` is searched for first. Than a
 * [[MapView]] object is created and set to initial values of camera settings and map's geo center.
 *
 * ```typescript
 * [[include:harp_gl_datasource_xyzmvt_example_1.ts]]
 * ```
 * As a map needs controls to allow any interaction with the user (e.g. panning), a [[MapControls]]
 * object is created.
 *
 * ```typescript
 * [[include:harp_gl_datasource_xyzmvt_example_2.ts]]
 * ```
 * Finally the map is being resized to fill the whole screen and a listener for a "resize" event is
 * added, which enables adjusting the map's size to the browser's window size changes.
 *
 * ```typescript
 * [[include:harp_gl_datasource_xyzmvt_example_3.ts]]
 * ```
 * At the end of the initialization a [[MapView]] object is returned. To show map tiles an exemplary
 * datasource is used, [[OmvDataSource]]:
 *
 * ```typescript
 * [[include:harp_gl_datasource_xyzmvt_example_4.ts]]
 * ```
 *
 * After creating a specific datasource it needs to be added to the map in order to be seen.
 *
 * ```typescript
 * [[include:harp_gl_datasource_xyzmvt_example_5.ts]]
 * ```
 *
 */
export namespace DatasourceXYZMVTExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        // snippet:harp_gl_datasource_xyzmvt_example_0.ts
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // end:harp_gl_datasource_xyzmvt_example_0.ts

        // snippet:harp_gl_datasource_xyzmvt_example_1.ts
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });
        // end:harp_gl_datasource_xyzmvt_example_1.ts

        CopyrightElementHandler.install("copyrightNotice")
            .attach(map)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        // snippet:harp_gl_datasource_xyzmvt_example_2.ts
        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;
        const ui = new MapControlsUI(mapControls, { zoomLevel: "input", projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);
        // end:harp_gl_datasource_xyzmvt_example_2.ts

        // snippet:harp_gl_datasource_xyzmvt_example_3.ts
        // resize the mapView to maximum
        map.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });
        // end:harp_gl_datasource_xyzmvt_example_3.ts

        return map;
    }

    const mapView = initializeMapView("mapCanvas");

    // snippet:harp_gl_datasource_xyzmvt_example_4.ts
    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.XYZMVT,
        styleSetName: "tilezen",
        maxZoomLevel: 17,
        authenticationCode: accessToken
    });
    // end:harp_gl_datasource_xyzmvt_example_4.ts

    // snippet:harp_gl_datasource_xyzmvt_example_5.ts
    mapView.addDataSource(omvDataSource);
    // end:harp_gl_datasource_xyzmvt_example_5.ts
}
