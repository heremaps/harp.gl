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
 * This example builds on top of the [[HelloWorldExample]], so please consult that first for any
 * questions regarding basic setup of the map.
 *
 * This example shows how to add a [THREE.js](https://threejs.org/) object to the scene.
 *
 * For the purposes of the demo, create a simple pink box.
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_0.ts]]
 * ```
 * Next we need to find the position to place the cube, we use the helpful method
 * [[getWorldPositionAt]] to get the world space position under the mouse when it is clicked, this
 * is shown here:
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_1.ts]]
 * ```
 *
 * Here the object is created and added to the scene.
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_2.ts]]
 * ```
 *
 * In harp.gl, we position elements [relative to
 * center](http://help.agi.com/AGIComponents/html/BlogPrecisionsPrecisions.htm), which helps to
 * ensure accuracy.
 *
 * The drawback of this is that we need to update the position of the cube each frame. This is
 * fortunately easy to do and is shown here:
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_3.ts]]
 * ```
 *
 * Finally, in order to see the cube rendered on the map, we need to force an update.
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_4.ts]]
 * ```
 */
export namespace ThreejsAddSimpleObject {
    // snippet:harp_gl_threejs_add_simple_object_0.ts
    const scale = 100;
    const geometry = new THREE.BoxGeometry(1 * scale, 1 * scale, 1 * scale);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00fe
    });
    function createPinkCube(): THREE.Mesh {
        const mesh = new THREE.Mesh(geometry, material);
        // Make sure the cube overlaps everything else, is completely arbitrary.
        mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        return mesh;
    }
    // end:harp_gl_threejs_add_simple_object_0.ts

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
            // snippet:harp_gl_threejs_add_simple_object_1.ts
            // Get the position of the mouse in world space.
            const worldPositionAtMouse = map.getWorldPositionAt(event.pageX, event.pageY);
            if (worldPositionAtMouse === null) {
                return;
            }
            // end:harp_gl_threejs_add_simple_object_1.ts

            // snippet:harp_gl_threejs_add_simple_object_2.ts
            const cube = createPinkCube();
            map.scene.add(cube);
            // end:harp_gl_threejs_add_simple_object_2.ts

            // snippet:harp_gl_threejs_add_simple_object_3.ts
            // Add a callback to execute before the items are rendered.
            map.addEventListener(MapViewEventNames.Render, () => {
                // Set the cube position relative to the world center. Note, we don't subtract the
                // [[worldCenter]] from the worldMousePosition, because we need to keep the cubes
                // world position untouched.
                cube.position.copy(worldPositionAtMouse).sub(map.worldCenter);
            });
            // end:harp_gl_threejs_add_simple_object_3.ts

            // snippet:harp_gl_threejs_add_simple_object_4.ts
            // Force the scene to be rerendered once the cube is added to the scene.
            map.update();
            // end:harp_gl_threejs_add_simple_object_4.ts
        });

        return map;
    }

    const message = document.createElement("div");
    message.innerHTML = `Click to add a ${scale}m wide cube to scene.`;

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
