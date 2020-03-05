/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import {
    CopyrightElementHandler,
    MapView,
    MapViewEventNames,
    MapViewUtils
} from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { apikey, copyrightInfo } from "../config";

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

    // Be sure to see the buildings when starting the example: a zoom level does not translate into
    // the same distance depending on the viewport's height.
    const minDistanceForBuildings =
        Math.ceil(MapViewUtils.calculateDistanceToGroundFromZoomLevel(map, 16.0)) - 500;
    // snippet:harp_gl_camera_orbit_example_1.ts
    const options = { tilt: 25, distance: minDistanceForBuildings, globe: true };
    const dubai = new GeoCoordinates(25.19705, 55.27419);
    let heading = 0;
    map.addEventListener(MapViewEventNames.AfterRender, () => {
        map.lookAt(dubai, options.distance, options.tilt, (heading = (heading + 0.1) % 360));
        map.update();
        updateHTML();
    });
    // end:harp_gl_camera_orbit_example_1.ts

    const gui = new GUI({ width: 300 });
    gui.add(options, "tilt", 0, 80, 0.1);
    gui.add(options, "distance", 300, 60000, 1);
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

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            authenticationCode: apikey,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "apikey"
            },
            copyrightInfo
        });
        mapView.addDataSource(omvDataSource);

        return mapView;
    }

    function updateHTML() {
        const infoElement = document.getElementById("info") as HTMLParagraphElement;
        infoElement.innerHTML =
            `This view is set through the lookAt method: map.lookAt(dubai, ` +
            `${options.distance.toFixed(0)}, ${options.tilt.toFixed(1)}, ${heading.toFixed(1)});`;
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
