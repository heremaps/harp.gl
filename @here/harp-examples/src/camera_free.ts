/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugTileDataSource } from "@here/harp-debug-datasource";
import { GeoCoordinates, webMercatorTilingScheme } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    MapViewEventNames,
    MapViewOptions
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import * as THREE from "three";
import { accessToken } from "../config";

// Import the gesture handlers from the three.js additional libraries.
// The controls are not in common.js they explictly require a
// global instance of THREE and they must be imported only for their
// side effect.
import "three/examples/js/controls/TrackballControls";
import "three/examples/js/controls/TransformControls";

/**
 * This app adds another freely moveable camera into the map view scene.
 * It can be used as a handy map inspection/debugging tool
 * easily enabling visual checks of the map rendering with different camera settings.
 *
 * The app enables to change the position of the camera: translate it, rotate it
 * as well as change the point of view (to the one the user would actually see).
 *
 * ```typescript
 * [[include:harp_gl_freecamera_app_0.ts]]
 * ```
 *
 */
export namespace FreeCameraAppDebuggingToolExample {
    interface Helper extends THREE.Object3D {
        update(): void;
    }

    interface FreeCameraAppOptions extends MapViewOptions {
        geoCenter?: GeoCoordinates;
        decoderUrl: string;
    }

    /**
     * [[FreeCameraApp]] class adds a debug camera view which enables to see the rendered map view
     * from a third person perspective as well as allows to freely modify the debug camera
     * position/rotation.
     *
     * The parameters of the [[FreeCameraApp]] are set in the [[FreeCameraAppOptions]] object.
     *
     * ```typescript
     * [[include:harp_gl_freecamera_app_0.ts]]
     * ```
     *
     */
    export class FreeCameraApp {
        private readonly mapView: MapView;
        private readonly mapControls: MapControls;
        private readonly helpers: Helper[] = [];

        // creates a new MapView for the HTMLCanvasElement of the given id
        constructor(readonly options: FreeCameraAppOptions) {
            this.mapView = new MapView(options);
            this.mapView.fog.enabled = false;

            this.mapControls = new MapControls(this.mapView);
            this.mapControls.enabled = false;

            CopyrightElementHandler.install("copyrightNotice", this.mapView);

            // let the camera float over the map, looking straight down
            this.mapView.camera.position.set(0, 0, 800);

            // center the camera somewhere around Berlin geo locations
            if (options.geoCenter !== undefined) {
                this.mapView.geoCenter = options.geoCenter;
            }

            // resize the mapView to maximum
            this.mapView.resize(window.innerWidth, window.innerHeight);

            // react on resize events
            window.addEventListener("resize", () => {
                this.mapView.resize(window.innerWidth, window.innerHeight);
            });
        }

        /**
         * Attaches the [[OmvDataSource]] and [[DebugTileDataSource]] to the map as well as
         * initializes the debug view (making the: `R`, `T` and `V` keys modify the camera's current
         * rotation (`R`), translation/postion (`T`) and changing the camera view to the one the
         * user is seeing (`V`).
         */
        start() {
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

            const debugTileDataSource = new DebugTileDataSource(webMercatorTilingScheme);

            this.mapView.addDataSource(omvDataSource);
            this.mapView.addDataSource(debugTileDataSource);

            this.initializeDebugView();
        }

        private initializeDebugView() {
            const pointOfView = new THREE.PerspectiveCamera(
                this.mapView.camera.fov,
                this.mapView.canvas.width / this.mapView.canvas.height,
                0.1,
                4000000
            ); // use an arbitrary large distance for the far plane.

            this.mapView.scene.add(pointOfView);

            pointOfView.position.set(0, -1500, 1500);

            this.mapView.pointOfView = pointOfView;

            const transformControls = new (THREE as any).TransformControls(
                pointOfView,
                this.mapView.canvas
            );
            transformControls.attach(this.mapView.camera);
            transformControls.addEventListener("mouseDown", () => {
                trackball.enabled = false;
            });
            transformControls.addEventListener("mouseUp", () => {
                trackball.enabled = true;
            });
            transformControls.addEventListener("objectChange", () => {
                this.mapView.update();
            });

            this.mapView.scene.add(transformControls);

            const cameraHelper = new THREE.CameraHelper(this.mapView.camera);

            // Set the renderOrder to an arbitrary large number, just to be sure that the camera
            // helpers are rendered on top of the map objects.
            cameraHelper.renderOrder = 5000;

            this.mapView.scene.add(cameraHelper);

            this.helpers.push(cameraHelper);

            // Set up the trackball gesture handler
            const trackball = new (THREE as any).TrackballControls(
                pointOfView,
                this.mapView.canvas
            );
            trackball.staticMoving = true;
            trackball.rotateSpeed = 3.0;
            trackball.zoomSpeed = 4.0;
            trackball.panSpeed = 2.0;

            trackball.addEventListener("start", () => {
                this.mapView.beginAnimation();
            });

            trackball.addEventListener("end", () => {
                this.mapView.endAnimation();
            });

            // Update the debug controls.
            this.mapView.addEventListener(MapViewEventNames.Render, () => {
                trackball.update();
                this.helpers.forEach(helper => helper.update());
            });

            window.addEventListener("resize", () => {
                const { width, height } = this.mapView.canvas;
                pointOfView.aspect = width / height;
                pointOfView.updateProjectionMatrix();
                this.mapView.update();
            });

            window.top.addEventListener("keydown", event => {
                switch (event.code) {
                    case "KeyT":
                        transformControls.setMode("translate");
                        this.mapView.update();
                        break;
                    case "KeyR":
                        transformControls.setMode("rotate");
                        this.mapView.update();
                        break;
                    case "KeyV":
                        if (this.mapView.pointOfView !== undefined) {
                            this.mapView.pointOfView = undefined;
                            this.mapControls.enabled = true;
                        } else {
                            this.mapView.pointOfView = pointOfView;
                            this.mapControls.enabled = false;
                        }
                        this.mapView.update();
                        break;
                    default:
                        break;
                } // switch
            });
        }
    }

    function main() {
        const message = document.createElement("div");
        message.innerHTML = `
Press 'R' to rotate<br>
Press 'T' to translate<br>
Press 'V' to change the scene point of view<br>`;

        message.style.position = "absolute";
        message.style.cssFloat = "right";
        message.style.top = "10px";
        message.style.right = "10px";
        document.body.appendChild(message);

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // snippet:harp_gl_freecamera_app_0.ts
        const app = new FreeCameraApp({
            decoderUrl: "./decoder.bundle.js",
            canvas,
            theme: "./resources/berlin_tilezen_base.json",
            geoCenter
        });

        app.start();
        // end:harp_gl_freecamera_app_0.ts
    }

    main();
}
