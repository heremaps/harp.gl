/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { apikey } from "../config";

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
 * [[include:harp_gl_hello_world_example_0.ts]]
 * ```
 *
 * During the initialization, canvas element with a given `id` is searched for first. Than a
 * [[MapView]] object is created and set to initial values of camera settings and map's geo center.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_1.ts]]
 * ```
 * As a map needs controls to allow any interaction with the user (e.g. panning), a [[MapControls]]
 * object is created.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_map_controls.ts]]
 * ```
 * By default the map is looking at Berlin. For this example we want to look at New York from a
 * nice angle and distance.
 * ```typescript
 * [[include:harp_gl_hello_world_example_look_at.ts]]
 * ```
 *
 * Finally the map is being resized to fill the whole screen and a listener for a "resize" event is
 * added, which enables adjusting the map's size to the browser's window size changes.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_3.ts]]
 * ```
 * At the end of the initialization a [[MapView]] object is returned. To show map tiles an exemplary
 * datasource is used, [[VectorTileDataSource]]:
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_4.ts]]
 * ```
 *
 * After creating a specific datasource it needs to be added to the map in order to be seen.
 *
 * ```typescript
 * [[include:harp_gl_hello_world_example_5.ts]]
 * ```
 *
 */
export namespace HelloWorldExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        // snippet:harp_gl_hello_world_example_0.ts
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // end:harp_gl_hello_world_example_0.ts

        // snippet:harp_gl_hello_world_example_1.ts
        // Look at New York.
        const NY = new GeoCoordinates(40.707, -74.01);
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json",
            target: NY,
            tilt: 50,
            heading: -20,
            zoomLevel: 16.1
        });
        // end:harp_gl_hello_world_example_1.ts

        CopyrightElementHandler.install("copyrightNotice", map);

        // snippet:harp_gl_hello_world_example_map_controls.ts
        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;
        // end:harp_gl_hello_world_example_map_controls.ts

        // Add an UI.
        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        // snippet:harp_gl_hello_world_example_3.ts
        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });
        // end:harp_gl_hello_world_example_3.ts

        addVectorTileDataSource(map);

        return map;
    }

    function addVectorTileDataSource(map: MapView) {
        // snippet:harp_gl_hello_world_example_4.ts
        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });
        // end:harp_gl_hello_world_example_4.ts

        // snippet:harp_gl_hello_world_example_5.ts
        map.addDataSource(omvDataSource);
        // end:harp_gl_hello_world_example_5.ts

        return map;
    }

    export const mapView = initializeMapView("mapCanvas");
}
