/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates, mercatorProjection, sphereProjection } from "@here/harp-geoutils";
import {
    CameraAnimationBuilder,
    CameraKeyTrackAnimation,
    ControlPoint
} from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { GUI } from "dat.gui";
import THREE = require("three");

import { apikey } from "../config";

interface GeoLocations {
    [key: string]: GeoCoordinates;
}
/**
 * In this example we use the [[CameraKeyTrackAnimation]] and the [[CameraAnimationBuilder]] to
 * generate animations.
 *
 * First we create a map
 * Then we generate different camera animations.
 *
 *
 * Flying a bow to a next location using a maximum altitude for the bow. As a starting
 * [[ControlPoint]], the current Camera properties are used and converted to a [[ControlPoint]].
 * ```typescript
 * [[include:harp_gl_camera_animation_1.ts]]
 * ```
 * An orbit animation around the current target of the map.
 * ```typescript
 * [[include:harp_gl_camera_animation_2.ts]]
 * ```
 *
 * A [[CameraKeyTrackAnimation]] using some geoLocations to generate the [[ControlPoint]]s
 *
 * The simple [[CameraKeyTrackAnimationOptions]] contain a list of [[ControlPoint]]s
 * ```typescript
 * [[include:harp_gl_camera_animation_3.ts]]
 * ```
 *
 *
 */
export namespace CameraAnimationExample {
    // snippet:harp_gl_camera_animation_0.ts
    const map = createBaseMap();
    // end:harp_gl_camera_animation_0.ts

    const geoLocations: GeoLocations = {
        Dubai: new GeoCoordinates(25.19705, 55.27419),
        BerlinStation: new GeoCoordinates(52.5250871, 13.367208),
        BerlinReichstag: new GeoCoordinates(52.5186234, 13.373993),
        BerlinTower: new GeoCoordinates(52.52081829, 13.407225)
    };

    map.lookAt({
        target: geoLocations.Dubai,
        distance: 1000,
        tilt: 45
    });

    const options = {
        globe: true,
        orbit: false,
        flyTo: "Dubai",
        flyOver: false
    };
    const animationOptions = {
        interpolation: THREE.InterpolateSmooth,
        loop: THREE.LoopOnce,
        repetitions: 1,
        rotateOnlyClockWise: true
    };
    let cameraAnimation: CameraKeyTrackAnimation | undefined;

    // snippet:harp_gl_camera_animation_3.ts
    const flyOverAnimationOptions = {
        controlPoints: [
            new ControlPoint({
                target: geoLocations.BerlinReichstag,
                timestamp: 0,
                heading: 300,
                tilt: 45,
                distance: 500
            }),
            new ControlPoint({
                target: geoLocations.BerlinStation,
                timestamp: 10,
                heading: 20,
                tilt: 45,
                distance: 3000
            }),
            new ControlPoint({
                target: geoLocations.BerlinTower,
                timestamp: 15,
                heading: 180,
                tilt: 35,
                distance: 200
            })
        ]
    };
    // end:harp_gl_camera_animation_3.ts

    const gui = new GUI({ width: 300 });
    gui.add(options, "globe").onChange(() => {
        map.projection = options.globe ? sphereProjection : mercatorProjection;
    });
    gui.add(options, "orbit").onChange(enableOrbit).listen();
    gui.add(options, "flyTo", [...Object.keys(geoLocations)])
        .onChange(flyTo)
        .listen();
    gui.add(options, "flyOver").onChange(enableFlyOver).listen();

    gui.add(animationOptions, "interpolation", {
        smooth: THREE.InterpolateSmooth,
        linear: THREE.InterpolateLinear,
        discrete: THREE.InterpolateDiscrete
    })
        .onChange(value => {
            animationOptions.interpolation = parseInt(value, 10);
            alert("This will only take effect for the next animation created");
        })
        .listen();

    gui.add(animationOptions, "repetitions", [1, 2, 3, 5, 10, Infinity])
        .onChange(value => {
            if (cameraAnimation) {
                cameraAnimation.repetitions = value;
            }
        })
        .listen();

    gui.add(animationOptions, "loop", {
        once: THREE.LoopOnce,
        pingpong: THREE.LoopPingPong,
        repeat: THREE.LoopRepeat
    }).onChange(value => {
        animationOptions.loop = parseInt(value, 10);
        if (cameraAnimation) {
            cameraAnimation.loop = parseInt(value, 10);
        }
    });

    gui.add(animationOptions, "rotateOnlyClockWise")
        .onChange(value => {
            if (cameraAnimation) {
                cameraAnimation.rotateOnlyClockwise = value;
            }
        })
        .listen();

    function stopAnimation() {
        if (cameraAnimation) {
            cameraAnimation.stop();
            cameraAnimation = undefined;
            options.flyOver = false;
            options.orbit = false;
        }
    }
    function enableOrbit(enable: boolean) {
        stopAnimation();
        options.orbit = enable;
        if (enable) {
            cameraAnimation = createOrbitAnimation();
            cameraAnimation.start();
        }
    }

    function flyTo(location: string) {
        stopAnimation();
        options.flyTo = location;
        if (location !== "") {
            // snippet:harp_gl_camera_animation_1.ts
            const target = new ControlPoint({
                target: geoLocations[location] as GeoCoordinates,
                distance: 800,
                tilt: 25,
                heading: Math.random() * 360,
                timestamp: 10
            });
            const flyToOpts = CameraAnimationBuilder.createBowFlyToOptions(
                map,
                new ControlPoint({
                    ...CameraAnimationBuilder.getLookAtFromView(map),
                    timestamp: 0
                }),
                target
            );
            Object.assign(flyToOpts, animationOptions);
            cameraAnimation = new CameraKeyTrackAnimation(map, flyToOpts);
            // end:harp_gl_camera_animation_1.ts
            cameraAnimation.start();
        }
    }

    function enableFlyOver(enable: boolean) {
        stopAnimation();
        options.flyOver = enable;
        if (enable) {
            Object.assign(flyOverAnimationOptions, animationOptions);
            cameraAnimation = new CameraKeyTrackAnimation(map, flyOverAnimationOptions);
            cameraAnimation.start();
        }
    }

    function createOrbitAnimation(): CameraKeyTrackAnimation {
        // snippet:harp_gl_camera_animation_2.ts
        const orbitOpts = CameraAnimationBuilder.createOrbitOptions(
            new ControlPoint({
                ...CameraAnimationBuilder.getLookAtFromView(map),
                timestamp: 0
            }),
            3
        );
        Object.assign(orbitOpts, animationOptions);
        return new CameraKeyTrackAnimation(map, orbitOpts);
        // end:harp_gl_camera_animation_2.ts
    }

    function createBaseMap(): MapView {
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

        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });
        mapView.addDataSource(omvDataSource);

        return mapView;
    }
}
