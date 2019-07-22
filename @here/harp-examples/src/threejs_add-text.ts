/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapAnchor, MapView } from "@here/harp-mapview";
import * as THREE from "three";
import { HelloWorldExample } from "./getting-started_hello-world";

/**
 * This example builds on top of the [[ThreejsAddSimpleObject]], so please consult that first for any
 * questions regarding basic setup of the map and adding three.js objects to the scene.
 *
 * This example shows how to add a [THREE.js](https://threejs.org/) text geometry to the scene.
 *
 */
export namespace ThreejsAddText {
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
    function addTextGeometry(mapView: MapView) {
        mapView.renderLabels = false;
        const loader = new THREE.FontLoader();
        loader.load("resources/Fira_Sans_Light_Regular.json", font => {
            const textGeometry = new THREE.TextBufferGeometry("3d web map rendering engine", {
                font,
                size: 100,
                height: 20,
                curveSegments: 12,
                bevelThickness: 2,
                bevelSize: 5,
                bevelEnabled: true
            });
            textGeometry.computeBoundingBox();

            const logoGeometry = new THREE.TextBufferGeometry("harp.gl", {
                font,
                size: 500,
                height: 20,
                curveSegments: 12,
                bevelThickness: 2,
                bevelSize: 5,
                bevelEnabled: true
            });
            logoGeometry.computeBoundingBox();
            const center = new THREE.Vector3()
                .copy(logoGeometry.boundingBox.max)
                .sub(logoGeometry.boundingBox.min)
                .multiplyScalar(-0.5);
            const logoMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color("rgb(72,218,208)"),
                emissive: "#404040"
            });

            const textMaterial = new THREE.MeshStandardMaterial({
                color: new THREE.Color("#ffffff"),
                emissive: "#404040"
            });

            const anchor = new THREE.Object3D() as MapAnchor<THREE.Object3D>;
            anchor.geoPosition = new GeoCoordinates(40.69855966, -74.0139806);

            const logoMesh = new THREE.Mesh(logoGeometry, logoMaterial);
            logoMesh.name = "harp.gl_text";
            logoMesh.position.set(center.x, 0, 180);
            logoMesh.renderOrder = 10000;
            logoMesh.rotateX(Math.PI / 2);
            anchor.add(logoMesh);

            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.name = "text";
            textMesh.position.set(center.x + 80, -200, 60);
            textMesh.renderOrder = 10000;
            textMesh.rotateX(Math.PI / 2);
            anchor.add(textMesh);

            mapView.mapAnchors.add(anchor);
            mapView.update();
        });
    }

    const message = document.createElement("div");
    message.innerHTML = "Mesh generated with THREE.JS TextBufferGeometry.";

    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "10px";
    message.style.right = "10px";
    document.body.appendChild(message);

    addTextGeometry(HelloWorldExample.mapView);
}
