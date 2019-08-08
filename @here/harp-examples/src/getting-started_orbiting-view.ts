/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    MapViewEventNames
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { accessToken } from "../config";

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
    const options = { tilt: 45, distance: 2500, globe: true };
    const NY = new GeoCoordinates(40.707, -74.012);
    let azimuth = 0;
    map.addEventListener(MapViewEventNames.AfterRender, () => {
        map.lookAt(NY, options.distance, options.tilt, (azimuth = (azimuth + 0.1) % 360));
        map.update();
        updateHTML();
    });
    // end:harp_gl_camera_orbit_example_1.ts

    const gui = new GUI({ width: 300 });
    gui.add(options, "tilt", 0, 80, 0.1);
    gui.add(options, "distance", 300, 30000, 1);
    gui.add(options, "globe").onChange(() => {
        map.projection = options.globe ? sphereProjection : mercatorProjection;
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

        const hereCopyrightInfo: CopyrightInfo = {
            id: "here.com",
            year: new Date().getFullYear(),
            label: "HERE",
            link: "https://legal.here.com/terms"
        };
        const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo: copyrights
        });
        mapView.addDataSource(omvDataSource);

        return mapView;
    }

    function updateHTML() {
        const infoElement = document.getElementById("info") as HTMLParagraphElement;
        infoElement.innerHTML =
            `This view is set through the lookAt method: map.lookAt(NY, ` +
            `${options.distance.toFixed(0)}, ${options.tilt.toFixed(1)}, ${azimuth.toFixed(1)});`;
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
