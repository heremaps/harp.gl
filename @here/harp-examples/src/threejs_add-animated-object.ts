/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapViewEventNames, MapViewUtils, RenderEvent } from "@here/harp-mapview";
import * as THREE from "three";
import { HelloWorldExample } from "./hello";

// tslint:disable-next-line:no-var-requires
(window as any).Zlib = require("three/examples/js/libs/inflate.min.js").Zlib;

import "three/examples/js/loaders/FBXLoader";

/**
 * This example builds on top of the [[ThreejsAddSimpleObject]].
 * Additionaly this example shows how to animate a [THREE.js](https://threejs.org/) object that
 * was added to the scene.
 *
 * Therefore the object is loaded with one of the [THREE.js](https://threejs.org/) loaders (we chose
 * FBX here).
 * ```typescript
 * [[include:harp_gl_threejs_add_animated-object_load.ts]]
 * ```
 *
 * Once the object is loaded, we add it to the [[MapView.scene]] :
 * ```typescript
 * [[include:harp_gl_threejs_add_animated-object_add_to_scene.ts]]
 * ```
 *
 * Similar to the [[ThreejsAddSimpleObject]] example we add an event listener to the map view
 * that is called whenever the map is rendered to update the position of the object.
 * ```typescript
 * [[include:harp_gl_threejs_add_animated-object_add_listener.ts]]
 * ```
 * In the same callback we additionaly update the animation of our object:
 * ```typescript
 * [[include:harp_gl_threejs_add_animated-object_update_animation.ts]]
 * ```
 *
 * Normaly the map is only rendered when needed, i.e. when the user is interacting with the map.
 * Since we want to have a constant animation we have to tell [[MapView]] to always render.
 * We can do this via [[MapView.beginAnimation]]. We can stop the animation again with
 * [[MapView.endAnimation]].
 * ```typescript
 * [[include:harp_gl_threejs_add_animated-object_begin_animation.ts]]
 * ```
 */
export namespace ThreejsAddAnimatedObject {
    const mapView = HelloWorldExample.mapView;
    const cameraPosition = new GeoCoordinates(
        40.7039253742025,
        -74.01438026902773,
        188.88345172009798
    );
    mapView.geoCenter = cameraPosition;
    MapViewUtils.setRotation(mapView, -40, 40);

    const figureGeoPosition = new GeoCoordinates(40.70497091, -74.0135);
    const figureWorldPosition = mapView.projection.projectPoint(
        figureGeoPosition,
        new THREE.Vector3()
    );

    const clock = new THREE.Clock();

    let figure: THREE.Group | undefined;
    let mixer: THREE.AnimationMixer | undefined;
    const onLoad = (object: any) => {
        mixer = new THREE.AnimationMixer(object);

        const action = mixer.clipAction(object.animations[0]);
        action.play();

        figure = object as THREE.Group;
        figure.traverse((child: THREE.Object3D) => {
            child.renderOrder = 10000;
        });
        figure.renderOrder = 10000;
        figure.rotateX(Math.PI / 2);
        figure.scale.set(0.3, 0.3, 0.3);
        figure.name = "guy";

        // snippet:harp_gl_threejs_add_animated-object_add_to_scene.ts
        mapView.scene.add(figure);
        // end:harp_gl_threejs_add_animated-object_add_to_scene.ts
    };

    // snippet:harp_gl_threejs_add_animated-object_load.ts
    const loader = new (THREE as any).FBXLoader();
    loader.load("resources/dancing.fbx", onLoad);
    // end:harp_gl_threejs_add_animated-object_load.ts

    const onRender = (event: RenderEvent) => {
        if (figure) {
            figure.position.copy(figureWorldPosition).sub(mapView.worldCenter);
        }

        if (mixer) {
            // snippet:harp_gl_threejs_add_animated-object_update_animation.ts
            const delta = clock.getDelta();
            mixer.update(delta);
            // end:harp_gl_threejs_add_animated-object_update_animation.ts
        }
    };

    // snippet:harp_gl_threejs_add_animated-object_add_listener.ts
    mapView.addEventListener(MapViewEventNames.Render, onRender);
    // end:harp_gl_threejs_add_animated-object_add_listener.ts

    // snippet:harp_gl_threejs_add_animated-object_begin_animation.ts
    mapView.beginAnimation();
    // end:harp_gl_threejs_add_animated-object_begin_animation.ts
}
