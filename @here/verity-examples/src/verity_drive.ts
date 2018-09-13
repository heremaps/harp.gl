/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { GeoCoordinates } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView, MapViewEventNames } from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";
import * as routing from "@here/routing";
import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three";
import { appCode, appId } from "../config";
import { bearerTokenProvider } from "./common";

export namespace DriveVisualisationExample {
    /**
     * [[DriveVisualisation]] class implements a way to follow a route on the map with a camera.
     * This is accomplished by using a 3rd party library:
     * [tween.js](https://github.com/tweenjs/tween.js)
     */
    export class DriveVisualisation {
        readonly view: MapView;

        readonly controls: MapControls;

        readonly routingService: routing.RoutingService;

        readonly car: HTMLSpanElement;

        constructor(mapCanvas: HTMLCanvasElement) {
            this.routingService = new routing.RoutingService(appId, appCode);

            this.car = document.createElement("span");
            this.car.style.background = "#44a8b0";
            this.car.style.width = "10px";
            this.car.style.height = "10px";
            this.car.style.borderRadius = "50%";
            this.car.style.position = "absolute";
            this.car.style.alignContent = "center";
            this.car.style.visibility = "hidden";

            document.body.appendChild(this.car);

            this.view = new MapView({
                // The canvas that will hold the MapView.
                canvas: mapCanvas,

                // The theme used by the MapView.
                theme: "./resources/theme.json",

                // the number of concurrent tile decoders (Web Workers)
                decoderCount: 2
            });

            this.view.addEventListener(MapViewEventNames.Render, () => {
                // update the TWEEN animations.
                TWEEN.update();
            });

            // Instantiate the MapView gesture handler.
            this.controls = new MapControls(this.view);

            // resize the mapView to maximumvisib
            this.view.resize(window.innerWidth, window.innerHeight);

            // react on resize events
            window.addEventListener("resize", () => {
                this.view.resize(window.innerWidth, window.innerHeight);
            });

            this.view.addDataSource(
                new OmvDataSource({
                    baseUrl: "https://vector.cit.data.here.com/1.0/base/mc",
                    apiFormat: APIFormat.HereV1,
                    authenticationCode: bearerTokenProvider
                })
            );

            // set the height of the camera
            this.view.camera.position.set(0, 0, 300);
        }

        /**
         * Get a route from the HERE route service.
         *
         * @param from The start position in geo coordinates.
         * @param to  The end position in geo coordinates.
         */
        getRoute(
            from: GeoCoordinates,
            to: GeoCoordinates
        ): Promise<routing.CalculateRouteResponse> {
            return this.routingService.calculateRoute([from, to], {
                mode: {
                    type: routing.RoutingType.fastest,
                    transportMode: routing.TransportMode.car
                }
            });
        }

        /**
         * Get a precomputed demo route from (52.5177, 13.37679) to (52.47874, 13.3327).
         */
        async getDemoRoute(): Promise<routing.CalculateRouteResponse> {
            return require("../resources/route.json");
        }

        async simulate(route: routing.Route) {
            // get the first route
            const path = this.getRoutePath(route);

            if (path === undefined) {
                return;
            } // failed to create a three.js path.

            const rotZ = new THREE.Quaternion();

            const speed = 100;
            const distance = path.getLength();
            const tm = (distance / speed) * 3600;

            const tween = new TWEEN.Tween({ percent: 0 })
                .to({ percent: 1.0 }, tm)
                .onStart(() => {
                    this.car.style.visibility = "visible";
                    this.controls.enabled = false;
                })
                .onComplete(() => {
                    this.car.style.visibility = "hidden";
                    this.controls.enabled = true;
                })
                .onUpdate(({ percent }) => {
                    const { x, y } = path.getPoint(percent);
                    const tangent = path.getTangent(percent);

                    const geoPos = this.view.projection.unprojectPoint({ x, y, z: 0 });
                    const screenPos = this.view.getScreenPosition(geoPos);

                    if (screenPos) {
                        screenPos.x = screenPos.x - this.car.clientWidth / 2;
                        screenPos.y = screenPos.y - this.car.clientWidth / 2;
                        this.car.style.transform = `translate(${screenPos.x}px, ${screenPos.y}px)`;
                    }

                    const cameraRot = new THREE.Quaternion();
                    this.view.camera.getWorldQuaternion(cameraRot);

                    rotZ.setFromEuler(new THREE.Euler(0, 0, (Math.PI * 3) / 2 + tangent.angle()));

                    this.view.camera.quaternion.copy(cameraRot.slerp(rotZ, 0.01));

                    this.view.worldCenter.lerp(new THREE.Vector3(x, y, 0), 1);

                    this.view.update();
                });

            tween.start();
        }

        /**
         * Creates a three.js Path from a the shape points of the given route.
         *
         * @param route A Route from the HERE routing service.
         */
        private getRoutePath(route: routing.Route): THREE.Path | undefined {
            const { shape } = route;

            if (shape === undefined) {
                return undefined;
            }

            const points: THREE.Vector2[] = [];

            const worldPos = new THREE.Vector3();

            for (let i = 0; i < shape.length; i += 3) {
                const p = new GeoCoordinates(shape[i], shape[i + 1], shape[i + 2]);
                const { x, y } = this.view.projection.projectPoint(p, worldPos);
                points.push(new THREE.Vector2(x, y));
            }

            const path = new THREE.Path(points);

            return path;
        }
    }

    /**
     * Following a route on the map with a camera.
     * Using [tween.js](https://github.com/tweenjs/tween.js).
     *
     * Showing an animation of the camera following a route using the [[DriveVisualisation]] class
     * which expects a canvas DOM element to be passed and a route to follow.
     * ```typescript
     * [[include:vislib_drive_example_0.ts]]
     * ```
     */

    // snippet:vislib_drive_example_0.ts
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement | null;

    if (canvas === null) {
        throw new Error("cannot find 'mapCanvas' element");
    }

    const drive = new DriveVisualisation(canvas);

    drive.getDemoRoute().then(response => {
        if (response.route === undefined || response.route.length === 0) {
            return;
        }
        drive.simulate(response.route[0]);
    });
    // end:vislib_drive_example_0.ts
}
