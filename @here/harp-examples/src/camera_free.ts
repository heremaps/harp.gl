import { DebugTileDataSource } from "@here/debug-datasource";
import { GeoCoordinates, webMercatorTilingScheme } from "@here/geoutils";
import { MapControls } from "@here/map-controls";
import { MapView, MapViewEventNames, MapViewOptions } from "@here/mapview";
import { APIFormat, OmvDataSource } from "@here/omv-datasource";
import * as THREE from "three";

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
 */
export namespace FreeCameraApp_DebugingToolExample {
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
     * [[include:vislib_freecamera_app_0.ts]]
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

            this.mapControls = new MapControls(this.mapView);
            this.mapControls.enabled = false;

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
            const omvDataSource = new OmvDataSource({
                baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
                apiFormat: APIFormat.MapzenV2,
                styleSetName: "tilezen",
                maxZoomLevel: 17
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

            pointOfView.position.set(0, -3000, 3000);

            this.mapView.pointOfView = pointOfView;

            const transformControls = new THREE.TransformControls(pointOfView, this.mapView.canvas);
            transformControls.attach(this.mapView.camera);

            this.mapView.scene.add(transformControls);

            const cameraHelper = new THREE.CameraHelper(this.mapView.camera);

            // Set the renderOrder to an arbitrary large number, just to be sure that the camera
            // helpers are rendered on top of the map objects.
            cameraHelper.renderOrder = 5000;

            this.mapView.scene.add(cameraHelper);

            this.helpers.push(cameraHelper);

            // Set up the trackball gesture handler
            const trackball = new THREE.TrackballControls(pointOfView, this.mapView.canvas);

            trackball.addEventListener("start", () => {
                this.mapView.beginAnimation();
            });

            trackball.addEventListener("end", () => {
                this.mapView.endAnimation();
            });

            // Update the debug controls.
            this.mapView.addEventListener(MapViewEventNames.Render, () => {
                transformControls.update();
                trackball.update();
                this.helpers.forEach(helper => helper.update());
            });

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

        // snippet:vislib_freecamera_app_0.ts
        const app = new FreeCameraApp({
            decoderUrl: "./decoder.bundle.js",
            canvas,
            theme: "./resources/day.json",
            geoCenter
        });

        app.start();
        // end:vislib_freecamera_app_0.ts
    }

    main();
}
