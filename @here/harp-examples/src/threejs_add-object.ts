/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { LongPressHandler } from "@here/harp-map-controls";
import { MapAnchor, MapView } from "@here/harp-mapview";
import * as THREE from "three";
import { HelloWorldExample } from "./getting-started_hello-world_npm";

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
 * [[getGeoCoordinatesAt]] to get the geo space position under the mouse when it is clicked, this
 * is shown here:
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_1.ts]]
 * ```
 *
 * Here the object is created and added to the [[mapAnchors]] node of the [[MapView]] scene.
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_2.ts]]
 * ```
 *
 * Finally, in order to see the cube rendered on the map, we need to force an update.
 * ```typescript
 * [[include:harp_gl_threejs_add_simple_object_3.ts]]
 * ```
 */
export namespace ThreejsAddSimpleObject {
    // snippet:harp_gl_threejs_add_simple_object_0.ts
    const scale = 100;
    const geometry = new THREE.BoxGeometry(1 * scale, 1 * scale, 1 * scale);
    const material = new THREE.MeshStandardMaterial({
        color: 0x00ff00fe
    });
    function createPinkCube(): MapAnchor<THREE.Mesh> {
        const mesh = new THREE.Mesh(geometry, material);
        // Make sure the cube overlaps everything else, is completely arbitrary.
        mesh.renderOrder = Number.MAX_SAFE_INTEGER;
        return mesh;
    }
    // end:harp_gl_threejs_add_simple_object_0.ts

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function addMouseEventListener(mapView: MapView) {
        const canvas = mapView.canvas;

        // tslint:disable:no-unused-expression
        new LongPressHandler(canvas, event => {
            // snippet:harp_gl_threejs_add_simple_object_1.ts
            // Get the position of the mouse in geo space.
            const geoPosition = mapView.getGeoCoordinatesAt(event.pageX, event.pageY);
            if (geoPosition === null) {
                return;
            }
            // end:harp_gl_threejs_add_simple_object_1.ts

            // snippet:harp_gl_threejs_add_simple_object_2.ts
            const cube = createPinkCube();
            cube.geoPosition = geoPosition;
            mapView.mapAnchors.add(cube);
            // end:harp_gl_threejs_add_simple_object_2.ts

            // end:harp_gl_threejs_add_simple_object_3.ts
            // Request an update once the cube [[MapObject]] is added to [[MapView]].
            mapView.update();
            // end:harp_gl_threejs_add_simple_object_3.ts
        });
    }

    const message = document.createElement("div");
    message.innerHTML = `Long click to add a ${scale}m wide cube to scene.`;

    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "10px";
    message.style.right = "10px";
    document.body.appendChild(message);

    addMouseEventListener(HelloWorldExample.mapView);
}
