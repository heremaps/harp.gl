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
import { GeoCoordinates, MathUtils } from "@here/geoutils";
import { CameraRotationAnimation, MapControls } from "@here/map-controls";
import { MapView, MapViewEventNames } from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";

import { bearerTokenProvider } from "./common";

// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");

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
 * [[include:vislib_hello_animation_example_0.ts]]
 * ```
 *
 * During the initialization, canvas element with a given `id` is searched for first. Than a
 * [[MapView]] object is created and set to initial values of camera settings and map's geo center.
 *
 * ```typescript
 * [[include:vislib_hello_animation_example_1.ts]]
 * ```
 * As a map needs controls to allow any interaction with the user (e.g. panning), a [[MapControls]]
 * object is created.
 *
 * ```typescript
 * [[include:vislib_hello_animation_example_2.ts]]
 * ```
 * Finally the map is being resized to fill the whole screen and a listener for a "resize" event is
 * added, which enables adjusting the map's size to the browser's window size changes.
 *
 * ```typescript
 * [[include:vislib_hello_animation_example_3.ts]]
 * ```
 * At the end of the initialization a simple statistics display is added in the bottom left of the
 * window. It will show a graph displaying the number of rendered frames per second (FPS):
 *
 * ```typescript
 * [[include:vislib_hello_animation_example_6.ts]]
 * ```
 * At the end of the initialization a [[MapView]] object is returned. To show map tiles an exemplary
 * datasource is used, [[OmvDataSource]]:
 *
 * ```typescript
 * [[include:vislib_hello_animation_example_4.ts]]
 * ```
 *
 * After creating a specific datasource it needs to be added to the map in order to be seen.
 *
 * ```typescript
 * [[include:vislib_hello_animation_example_5.ts]]
 * ```
 *
 */
export namespace AnimationExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        // snippet:vislib_hello_animation_example_0.ts
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // end:vislib_hello_animation_example_0.ts

        // snippet:vislib_hello_animation_example_1.ts
        const sampleMapView = new MapView({
            canvas,
            theme: "resources/day.json"
        });
        // end:vislib_hello_animation_example_1.ts

        // snippet:vislib_hello_animation_example_2.ts
        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 1000);
        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // Let the camera look down at 45 degrees:
        sampleMapView.camera.rotateX(MathUtils.degToRad(45));

        // Instantiate the default map controls, allowing the user to pan around freely, even while
        // the animatioon is running.
        const controls = new MapControls(sampleMapView);

        // Create a simple rotation to animate the scene:
        const rotationAnimation = new CameraRotationAnimation(
            sampleMapView,
            controls,
            {
                repeat: Infinity,
                duration: 30000
            },
            "rotationAnimation"
        );

        const updateHandler = () => {
            if (rotationAnimation.isRunning) {
                rotationAnimation.update();
            }
        };

        // Do not start the animation before everything is loaded:
        setTimeout(() => {
            rotationAnimation.start();
        }, 1000);

        // Update the animation every time the map is rendered:
        sampleMapView.addEventListener(MapViewEventNames.Render, updateHandler);

        MapControls.create(sampleMapView);
        // end:vislib_hello_animation_example_2.ts

        // snippet:vislib_hello_animation_example_3.ts
        // Resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // React on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });
        // end:vislib_hello_animation_example_3.ts

        // snippet:vislib_hello_animation_example_6.ts
        const stats = new Stats();

        // Show plot with FPS, click in plot to cycle through other modes.
        stats.setMode(0); // 0: fps, 1: ms, 2: mb, 3+: custom

        stats.domElement.style.position = "absolute";
        stats.domElement.style.left = "0px";
        stats.domElement.style.top = "";
        stats.domElement.style.bottom = "0px";
        stats.domElement.style.zIndex = 10;

        document.body.appendChild(stats.domElement);

        sampleMapView.addEventListener(MapViewEventNames.Render, () => {
            stats.begin();
        });
        sampleMapView.addEventListener(MapViewEventNames.AfterRender, () => {
            stats.end();
        });
        // end:vislib_hello_animation_example_6.ts

        return sampleMapView;
    }

    const mapView = initializeMapView("mapCanvas");

    // snippet:vislib_hello_animation_example_4.ts
    const omvDataSource = new OmvDataSource({
        baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
        apiFormat: APIFormat.HereV1,
        maxZoomLevel: 17,
        authenticationCode: bearerTokenProvider
    });
    // end:vislib_hello_animation_example_4.ts

    // snippet:vislib_hello_animation_example_5.ts
    mapView.addDataSource(omvDataSource);
    // end:vislib_hello_animation_example_5.ts
}
