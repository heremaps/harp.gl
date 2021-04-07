/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView, MapViewEventNames, MapViewUtils } from "@here/harp-mapview";
import * as THREE from "three";

import { HelloWorldExample } from "./getting-started_hello-world_npm";

/**
 * This example builds on top of the [[HelloWorldExample]], so please consult that first for
 * any questions regarding basic setup of the map.
 *
 * This example shows how to use [[MapViewUtils]] to compute camera positions and orientations
 * and use them to animate them with [THREE.js](https://threejs.org/).
 *
 * [CatmulRomCurve3](https://threejs.org/docs/index.html#api/en/extras/curves/CatmullRomCurve3) is
 * used to interpolate between two camera positions and
 * [Quaternion](https://threejs.org/docs/index.html#api/en/math/Quaternion.slerp) is used to
 * interpolate between two camera orientations.
 */
export namespace ThreejsCameraAnimation {
    interface Location {
        target: GeoCoordinates;
        tilt: number;
        heading: number;
        distance: number;
    }

    let currentLocation = 0;
    const locations: Location[] = [
        {
            // HERE Berlin
            target: new GeoCoordinates(52.5308419, 13.3850719),
            tilt: 0,
            heading: 0,
            distance: 1000
        },
        {
            // Museumsinsel Berlin
            target: new GeoCoordinates(52.5169285, 13.4010829),
            tilt: 45,
            heading: 45,
            distance: 300
        },
        {
            // TV-Tower Berlin
            target: new GeoCoordinates(52.520836, 13.409401, 300),
            tilt: 45,
            heading: 180,
            distance: 500
        }
    ];

    const message = document.createElement("div");
    const threejsLink = "https://threejs.org";
    message.innerHTML = `Example showing camera animations using
<a href="${threejsLink}">three.js</a>
<br>
Tap or use left/right keys to change location`;

    message.style.cssText = `
    color: #000;
    width: 80%;
    left: 50%;
    position: relative;
    margin-left: -40%;
    font-size: 15px;
    `;
    document.body.appendChild(message);

    function startTransition(mapView: MapView, location: Location) {
        const startPosition = mapView.camera.position.clone();
        const startQuaternion = mapView.camera.quaternion.clone();
        const targetPosition = MapViewUtils.getCameraPositionFromTargetCoordinates(
            location.target,
            location.distance,
            location.heading,
            location.tilt,
            mapView.projection
        );

        const targetQuaternion = MapViewUtils.getCameraRotationAtTarget(
            mapView.projection,
            location.target,
            location.heading,
            location.tilt
        );

        const startTime = Date.now();
        const curve = new THREE.CatmullRomCurve3([startPosition, targetPosition]);

        const updateListener = () => {
            const time = Date.now();
            let t = (time - startTime) / 1000;

            if (t >= 1) {
                t = 1;
                mapView.endAnimation();
                mapView.removeEventListener(MapViewEventNames.Render, updateListener);
            }
            mapView.camera.position.copy(curve.getPoint(t));
            const rotation = startQuaternion.clone().slerp(targetQuaternion, t);
            mapView.camera.quaternion.copy(rotation);
            mapView.camera.updateMatrixWorld(true);
        };

        mapView.addEventListener(MapViewEventNames.Render, updateListener);
        mapView.beginAnimation();
    }

    startTransition(HelloWorldExample.mapView, locations[0]);

    window.ontouchend = (ev: TouchEvent) => {
        const oldLocation = locations[currentLocation];
        currentLocation++;
        if (currentLocation >= locations.length) {
            currentLocation = 0;
        }
        const newLocation = locations[currentLocation];
        if (oldLocation === newLocation) {
            return;
        }
        startTransition(HelloWorldExample.mapView, newLocation);
    };
    window.onkeydown = (ev: KeyboardEvent) => {
        const oldLocation = locations[currentLocation];
        switch (ev.code) {
            case "ArrowLeft":
                currentLocation--;
                break;
            case "ArrowRight":
                currentLocation++;
                break;
        }
        if (currentLocation < 0) {
            currentLocation = locations.length - 1;
        } else if (currentLocation >= locations.length) {
            currentLocation = 0;
        }

        const newLocation = locations[currentLocation];
        if (oldLocation === newLocation) {
            return;
        }

        startTransition(HelloWorldExample.mapView, newLocation);
    };
}
