/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugTileDataSource } from "@here/harp-debug-datasource";
import { GeoCoordinates, webMercatorTilingScheme } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    MapView,
    MapViewEventNames,
    MapViewOptions,
    MapViewUtils
} from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";

import { apikey } from "../config";

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
            // Set the view over Geneva.
            const startLocation = new GeoCoordinates(46.207, 6.147);
            this.mapView.lookAt({ target: startLocation, zoomLevel: 16.5 });

            this.mapControls = new MapControls(this.mapView);
            this.mapControls.maxTiltAngle = 90;
            this.mapControls.enabled = false;

            CopyrightElementHandler.install("copyrightNotice", this.mapView);

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
         * Attaches the [[VectorTileDataSource]] and [[DebugTileDataSource]] to the map as well as
         * initializes the debug view (making the: `R`, `T` and `V` keys modify the camera's current
         * rotation (`R`), translation/postion (`T`) and changing the camera view to the one the
         * user is seeing (`V`).
         */
        start() {
            const omvDataSource = new VectorTileDataSource({
                baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
                authenticationCode: apikey
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
                100,
                400000
            ); // use an arbitrary large distance for the far plane.

            this.mapView.scene.add(pointOfView);

            // Setup relative to eye camera which is actually used in
            // map view to render tiles thus increasing data accuracy.
            const cameraRelativeToEye = new THREE.PerspectiveCamera();

            this.mapView.scene.add(cameraRelativeToEye);

            pointOfView.position.set(0, -4000, 2700);

            this.mapView.pointOfView = pointOfView;

            const transformControls = new TransformControls(pointOfView, this.mapView.canvas);
            transformControls.setSpace("world");
            transformControls.attach(cameraRelativeToEye);

            const applyTransformControls = () => {
                // Apply helper camera offset to main (map view) camera.
                this.mapView.camera.position.add(cameraRelativeToEye.position);
                // Make sure that the pitch limit constraint is preserved
                const ypr = MapViewUtils.extractAttitude(this.mapView, cameraRelativeToEye);
                ypr.pitch = Math.max(
                    Math.min(ypr.pitch, THREE.MathUtils.degToRad(this.mapControls.maxTiltAngle)),
                    0
                );
                // Finally apply rotation from transformation gizmo.
                MapViewUtils.setRotation(
                    this.mapView,
                    THREE.MathUtils.radToDeg(ypr.yaw),
                    THREE.MathUtils.radToDeg(ypr.pitch)
                );
                // Reset RTE camera orientation according to constraints applied.
                cameraRelativeToEye.copy(this.mapView.camera);
                // Reset RTE camera position to origin.
                cameraRelativeToEye.position.setScalar(0);
            };
            applyTransformControls();

            const applyMapControls = () => {
                cameraRelativeToEye.copy(this.mapView.camera, true);
                cameraRelativeToEye.position.setScalar(0);
            };

            transformControls.addEventListener("mouseDown", () => {
                trackball.enabled = false;
            });
            transformControls.addEventListener("mouseUp", () => {
                trackball.enabled = true;
            });
            transformControls.addEventListener("objectChange", () => {
                applyTransformControls();
                this.mapView.update();
            });

            this.mapView.scene.add(transformControls);

            const cameraHelper = new THREE.CameraHelper(cameraRelativeToEye);

            // Set the renderOrder to an arbitrary large number, just to be sure that the camera
            // helpers are rendered on top of the map objects.
            cameraHelper.renderOrder = 5000;

            this.mapView.scene.add(cameraHelper);

            this.helpers.push(cameraHelper);

            // Set up the trackball gesture handler
            const trackball = new TrackballControls(pointOfView, this.mapView.canvas);
            (trackball.target as THREE.Vector3).set(0, 0, -2000);
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

            window.focus();
            window.addEventListener("resize", () => {
                const { width, height } = this.mapView.canvas;
                pointOfView.aspect = width / height;
                pointOfView.updateProjectionMatrix();
                this.mapView.update();
            });

            window.addEventListener("keydown", event => {
                switch (event.code) {
                    case "KeyT":
                        transformControls.setMode("translate");
                        // Allow translations at any axis.
                        transformControls.showX = true;
                        transformControls.showY = true;
                        transformControls.showZ = true;
                        this.mapView.update();
                        break;
                    case "KeyR":
                        transformControls.setMode("rotate");
                        // Only pitch and yaw may be adjusted.
                        transformControls.showX = true;
                        transformControls.showY = false;
                        transformControls.showZ = true;
                        this.mapView.update();
                        break;
                    case "KeyV":
                        if (this.mapView.pointOfView !== undefined) {
                            this.mapView.pointOfView = undefined;
                            this.mapControls.enabled = true;
                            transformControls.enabled = false;
                            trackball.enabled = false;
                            applyTransformControls();
                        } else {
                            this.mapView.pointOfView = pointOfView;
                            this.mapControls.enabled = false;
                            transformControls.enabled = true;
                            trackball.enabled = true;
                            applyMapControls();
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

        // snippet:harp_gl_freecamera_app_0.ts
        const app = new FreeCameraApp({
            decoderUrl: "./decoder.bundle.js",
            canvas,
            theme: "./resources/berlin_tilezen_base.json"
        });

        app.start();
        // end:harp_gl_freecamera_app_0.ts
    }

    main();
}
