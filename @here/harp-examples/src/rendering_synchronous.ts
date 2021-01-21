/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates } from "@here/harp-geoutils";
import { CopyrightElementHandler, MapView, MapViewEventNames } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";
import THREE = require("three");
import { apikey, copyrightInfo } from "../config";

/**
 * The example shows how to render map synchronously within your own render loop.
 * By default, when map is updated, changes will be rendered in the next animation frame.
 *
 * Setting `synchronousRendering` to `true` allows to control rendering process
 * and by calling `mapView.renderSync()`.
 *
 * ```typescript
 * [[include:harp_gl_rendering_synchronous_1.ts]]
 * ```
 *
 * `MapViewEventNames.Update` event fired when [[MapView]] requests for a redraw.
 * E.g.: Tiles asynchronously decoded and ready for rendering, labels animation, etc...
 *
 * Subscribe to this event, and call your `update` method.
 *
 * ```typescript
 * [[include:harp_gl_rendering_synchronous_2.ts]]
 * ```
 *
 * Implement your own render loop like in the example below.
 * With `mapView.renderSync()` you will immediately redraw the map scene.
 *
 * Make checks to avoid multiple redrawing at one frame.
 *
 * ```typescript
 * [[include:harp_gl_rendering_synchronous_3.ts]]
 * ```
 *
 */
export namespace SynchronousRendering {
    // Creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        // snippet:harp_gl_rendering_synchronous_1.ts
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json",
            synchronousRendering: true
        });
        // end:harp_gl_rendering_synchronous_1.ts
        map.renderLabels = false;

        CopyrightElementHandler.install("copyrightNotice", map);

        // Resize the mapView to maximum
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            authenticationCode: apikey,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "apikey"
            },
            copyrightInfo
        });
        map.addDataSource(omvDataSource);

        return map;
    }

    class Popup {
        private canvas: HTMLCanvasElement;
        private context: CanvasRenderingContext2D;

        constructor(text: string, private readonly coordinates: GeoCoordinates) {
            this.addHTMLElements(text);

            this.canvas = document.getElementById("popupLine") as HTMLCanvasElement;
            this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;

            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            window.addEventListener("resize", () => {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
            });
        }

        addHTMLElements(text: string) {
            document.body.innerHTML += `
                <style>
                    #popupLine {
                        position: absolute;
                        border: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        top: 0;
                        overflow: hidden;
                        z-index: 1;
                    }
                    .popup {
                        background: #000;
                        position: absolute;
                        right: 75%;
                        bottom: 75%;
                        color: #cceeff;
                        margin: 0 -1px -1px 0;
                        padding: 3px 10px;
                    }
                </style>
                <canvas id="popupLine"></canvas>
                <div class="popup">${text}</div>
            `;
        }

        drawConnectionLine() {
            if (this.context) {
                const width = this.canvas.width;
                const height = this.canvas.height;
                const position = mapView.projection.projectPoint(
                    this.coordinates,
                    new THREE.Vector3()
                );
                const vector = position.project(mapView.camera);

                vector.x = ((vector.x + 1) / 2) * width;
                vector.y = (-(vector.y - 1) / 2) * height;
                this.context.lineWidth = 2;
                this.context.clearRect(0, 0, width, height);
                this.context.beginPath();
                this.context.moveTo(width / 4, height / 4);
                this.context.lineTo(vector.x, vector.y);
                this.context.stroke();
            }
        }
    }

    const popup = new Popup("One World Trade Center", new GeoCoordinates(40.713, -74.013, 541.3));

    const state = {
        target: new GeoCoordinates(40.707, -74.01, 0),
        zoomLevel: 16,
        tilt: 35,
        heading: 0
    };

    const mapView = initializeMapView("mapCanvas");

    // snippet:harp_gl_rendering_synchronous_2.ts
    mapView.addEventListener(MapViewEventNames.Update, requestDraw);
    // end:harp_gl_rendering_synchronous_2.ts

    // snippet:harp_gl_rendering_synchronous_3.ts
    let requestDrawPending = false;
    let drawing = false;

    // Requests a redraw of the scene.
    function requestDraw() {
        // Cancel request for redrawing if already pending
        if (requestDrawPending) {
            return;
        }
        requestDrawPending = true;

        requestAnimationFrame(draw);
    }

    function draw(frameStartTime: number) {
        // Avoids multiple redrawing
        if (drawing) {
            return;
        }
        requestDrawPending = false;
        drawing = true;

        // Draw popup's connection line
        popup.drawConnectionLine();

        state.heading += 0.1;
        // Set target and camera rotation
        mapView.lookAt(state);

        // Draw map scene
        mapView.renderSync(frameStartTime);
        drawing = false;
    }
    // end:harp_gl_rendering_synchronous_3.ts
}
