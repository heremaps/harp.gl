/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapView, MapViewEventNames } from "@here/harp-mapview";
import * as THREE from "three";
import { HelloWorldExample } from "./hello";

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
 * For ensuring enough precision close to the camera harp.gl uses [relative to
 * center](http://help.agi.com/AGIComponents/html/BlogPrecisionsPrecisions.htm).
 *
 * Therefore we have to adjust the position of the object each frame. We do this
 * by adding an event listener to the map view that is called whenever the map is
 * rendered:
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_3.ts]]
 * ```
 * In the callback we just subtract the [[MapView.worldCenter]] from the desired
 * world position of the object:
 * ```typescript
 * [[include:harp_gl_threejs_add_simple-object_rtc.ts]]
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
    function addMouseEventListener(mapView: MapView) {
        const canvas = mapView.canvas;

        canvas.addEventListener("mousedown", event => {
            // snippet:harp_gl_threejs_add_simple_object_1.ts
            // Get the position of the mouse in world space.
            const worldPositionAtMouse = mapView.getWorldPositionAt(event.pageX, event.pageY);
            if (worldPositionAtMouse === null) {
                return;
            }
            // end:harp_gl_threejs_add_simple_object_1.ts

            // snippet:harp_gl_threejs_add_simple_object_2.ts
            const cube = createPinkCube();
            mapView.scene.add(cube);
            // end:harp_gl_threejs_add_simple_object_2.ts

            const onRender = () => {
                // Set the cube position relative to the world center. Note, we don't subtract the
                // [[worldCenter]] from the worldMousePosition, because we need to keep the cubes
                // world position untouched.

                // snippet:harp_gl_threejs_add_simple-object_rtc.ts
                cube.position.copy(worldPositionAtMouse).sub(mapView.worldCenter);
                // end:harp_gl_threejs_add_simple-object_rtc.ts
            };

            // snippet:harp_gl_threejs_add_simple_object_3.ts
            // Add a callback to execute before the items are rendered.
            mapView.addEventListener(MapViewEventNames.Render, onRender);
            // end:harp_gl_threejs_add_simple_object_3.ts

            // snippet:harp_gl_threejs_add_simple_object_4.ts
            // Force the scene to be rerendered once the cube is added to the scene.
            mapView.update();
            // end:harp_gl_threejs_add_simple_object_4.ts
        });
    }

    const message = document.createElement("div");
    message.innerHTML = `Click to add a ${scale}m wide cube to scene.`;

    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "10px";
    message.style.right = "10px";
    document.body.appendChild(message);

    addMouseEventListener(HelloWorldExample.mapView);
}
