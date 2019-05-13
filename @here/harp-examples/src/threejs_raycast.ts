/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    MapViewEventNames
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import * as THREE from "three";
import { accessToken } from "../config";

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
    const scale = 10;
    const geometry = new THREE.BoxGeometry(1 * scale, 1 * scale, 1 * scale);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00fe
    });
    // Return a pink cube.
    function createPinkCube(): THREE.Mesh {
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

        // Center the camera on Manhattan, New York City.
        map.setCameraGeolocationAndZoom(new GeoCoordinates(40.6935, -74.009), 16.9);

        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxPitchAngle = 50;
        mapControls.setRotation(6.3, 50);

        // Add an UI.
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        canvas.addEventListener("mousedown", event => {
            // User must have pressed the 'Ctrl' key to add a box.
            if (!event.ctrlKey) {
                return;
            }

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
            map.scene.add(cube);

            // Add a callback to execute before the items are rendered.
            map.addEventListener(MapViewEventNames.Render, () => {
                // Set the cube position relative to the world center. Note, we don't subtract the
                // [[worldCenter]] from the worldMousePosition, because we need to keep the cubes
                // world position untouched.
                cube.position.copy(worldPoint).sub(map.worldCenter);
            });

            // Force the scene to be rerendered once the cube is added to the scene.
            map.update();
        });

        return map;
    }

    const message = document.createElement("div");
    message.innerHTML = `Click + 'Ctrl' to add a 10m^3 pink box under the mouse cursor location.`;

    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "10px";
    message.style.right = "10px";
    document.body.appendChild(message);

    const mapView = initializeMapView("mapCanvas");

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
}
