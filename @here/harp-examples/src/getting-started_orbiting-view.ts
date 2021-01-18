/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import { CopyrightElementHandler, MapView, MapViewEventNames } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { GUI } from "dat.gui";
import * as Stats from "stats.js";

import { apikey } from "../config";

/**
 * In this example we simply use the `lookAt` method to make the camera orbit around a geolocation.
 *
 * First we create the map.
 * ```typescript
 * [[include:harp_gl_camera_orbit_example_0.ts]]
 * ```
 *
 * Then we listen to render events to trigger new `lookAt` calls with progressing yaw angle offsets:
 * ```typescript
 * [[include:harp_gl_camera_orbit_example_1.ts]]
 * ```
 *
 * Here a GUI is also set up so as to fiddle with the tilt and distance from the page.
 */
export namespace CameraOrbitExample {
    // snippet:harp_gl_camera_orbit_example_0.ts
    const map = createBaseMap();
    // end:harp_gl_camera_orbit_example_0.ts

    // snippet:harp_gl_camera_orbit_example_1.ts
    const dubai = new GeoCoordinates(25.19705, 55.27419);
    const options = {
        target: dubai,
        tilt: 25,
        zoomLevel: 16.1,
        heading: 0,
        globe: true,
        headingSpeed: 0.1
    };
    map.addEventListener(MapViewEventNames.AfterRender, () => {
        options.heading = (options.heading + options.headingSpeed) % 360;
        map.lookAt(options);
        map.update();
        updateHTML();
    });
    // end:harp_gl_camera_orbit_example_1.ts

    const gui = new GUI({ width: 300 });
    gui.add(options, "tilt", 0, 80, 0.1);
    gui.add(options, "zoomLevel", 1, 20, 0.1);
    gui.add(options, "globe").onChange(() => {
        map.projection = options.globe ? sphereProjection : mercatorProjection;
    });
    gui.add(options, "headingSpeed", 0.1, 10, 0.1);

    const stats = new Stats();
    stats.dom.style.bottom = "0px";
    stats.dom.style.top = "";
    document.body.appendChild(stats.dom);
    map.addEventListener(MapViewEventNames.Render, () => {
        stats.end();
        stats.begin();
    });

    function createBaseMap(): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            projection: sphereProjection,
            theme: "resources/berlin_tilezen_base_globe.json"
        });
        canvas.addEventListener("contextmenu", e => e.preventDefault());

        CopyrightElementHandler.install("copyrightNotice", mapView);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });
        mapView.addDataSource(omvDataSource);

        return mapView;
    }

    function updateHTML() {
        const infoElement = document.getElementById("info") as HTMLParagraphElement;
        infoElement.innerHTML =
            `This view is set through the lookAt method: map.lookAt({target: dubai, ` +
            `zoomLevel: ${options.zoomLevel.toFixed(1)}, ` +
            `tilt: ${options.tilt.toFixed(1)}, ` +
            `heading: ${options.heading.toFixed(1)}})`;
    }

    function getExampleHTML() {
        return `
            <style>
                #mapCanvas{
                    top:0
                }
                #info{
                    color: #fff;
                    width: 80%;
                    left: 50%;
                    position: relative;
                    margin: 10px 0 0 -40%;
                    font-size: 15px;
                }
                @media screen and (max-width: 700px) {
                    #info{
                        font-size:11px;
                    }
                }
                </style>
                <p id=info></p>
        `;
    }
}
