/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { LongPressHandler, MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapAnchor, MapView } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey, copyrightInfo } from "../config";

/**
 * This example shows how we can pick the scene and add a [three.js](https://threejs.org/) object.
 *
 * The first step is to call the [[intersectMapObjects]] method using the x and y position of the
 * click event.
 *
 * ```typescript
 * [[include:harp_gl_threejs_raycast_0.ts]]
 * ```
 *
 * Secondly, we extract the 3D point and transform it from local into world space.
 * ```typescript
 * [[include:harp_gl_threejs_raycast_1.ts]]
 * ```
 *
 * Finally, we add the cube and reposition it during rendering as demonstrated in the
 * [[ThreejsAddSimpleObject]] example.
 */
export namespace ThreejsRaycast {
    const scale = 100;
    const geometry = new THREE.BoxGeometry(1 * scale, 1 * scale, 1 * scale);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00fe
    });
    // Return a pink cube.
    function createPinkCube(): MapAnchor {
        const mesh = new THREE.Mesh(geometry, material);
        // Make sure the cube overlaps everything else, is completely arbitrary.
        mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        return mesh;
    }

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        // Center the camera on Manhattan, New York City.
        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt({ target: NY, zoomLevel: 17, tilt: 50 });

        // Add an UI.
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        new LongPressHandler(canvas, event => {
            // snippet:harp_gl_threejs_raycast_0.ts
            const pickResults = map.intersectMapObjects(event.pageX, event.pageY);
            if (pickResults.length === 0) {
                return;
            }
            // end:harp_gl_threejs_raycast_0.ts

            // snippet:harp_gl_threejs_raycast_1.ts
            const worldPoint = new THREE.Vector3();
            // Pick results is sorted by distance, so we choose the first point in 3D.
            for (const pick of pickResults) {
                if (pick.point instanceof THREE.Vector3) {
                    worldPoint.copy(pick.point);
                    // Points returned from the intersectMapObjects are in local space, hence we
                    // transform to actual world space.
                    worldPoint.add(map.worldCenter);
                    break;
                }
            }
            // snippet:harp_gl_threejs_raycast_1.ts

            const cube = createPinkCube();
            cube.anchor = worldPoint;
            map.mapAnchors.add(cube);

            // Force the scene to be rerendered once the cube is added to the scene.
            map.update();
        });

        return map;
    }

    document.body.innerHTML +=
        `<style>
            #mapCanvas{
                top:0;
            }
            #info{
                color: #000;
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
        <p id=info>Long click to add a pink box under the mouse cursor, with respect of ` +
        `buildings' height.</p>
    `;

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new VectorTileDataSource({
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
}
