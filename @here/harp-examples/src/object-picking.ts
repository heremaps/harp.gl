/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView, PickResult } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { apikey } from "../config";

/**
 * This example showcases how picking works.
 *
 * To enable polygon picking set `gatherFeatureAttributes: true` in
 * [[OmvWithRestClientParams]] or in [[OmvWithCustomDataProvider]].
 * To enable text element picking set `gatherFeatureAttributes: true` in
 * [[OmvWithRestClientParams]] or in [[OmvWithCustomDataProvider]].
 *
 * Now, let's write an event that fires when the user clicks the map canvas:
 * ```typescript
 * [[include:datasource_object_picking_1.ts]]
 * ```
 *
 * All the data handling is covered by the `handlePick` function. Here we find the
 * intersected objects, pick the first one in the array and display its
 * data inside the helper box
 * ```typescript
 * [[include:datasource_object_picking_2.ts]]
 * ```
 */

export namespace PickingExample {
    document.body.innerHTML += `
        <style>
            #mouse-picked-result{
                position:absolute;
                bottom:5px;
                border-radius: 5px;
                margin-left:10px;
                padding: 9px 12px;
                background: #37afaa;
                display: inline-block;
                visibility: hidden;
                text-align: left;
                right:50px;
            }
            #mapCanvas {
              top: 0;
            }
            #info{
                color: #fff;
                width: 80%;
                left: 50%;
                position: relative;
                margin: 10px 0 0 -40%;
                font-size: 15px;
            }
            @media screen and (max-width: 700px) {
                #info{
                    font-size:11px;
                }
            }
        </style>
        <p id=info>Click/touch a feature on the map to read its data (Land masses are not features).
        </p>
        <pre id="mouse-picked-result"></pre>
    `;

    initializeMapView("mapCanvas").catch(err => {
        throw err;
    });

    let lastCanvasPosition: { x: number; y: number } | undefined;

    function getCanvasPosition(
        event: MouseEvent | Touch,
        canvas: HTMLCanvasElement
    ): { x: number; y: number } {
        const { left, top } = canvas.getBoundingClientRect();
        return { x: event.clientX - Math.floor(left), y: event.clientY - Math.floor(top) };
    }

    // Trigger picking event only if there's (almost) no dragging.
    function isPick(eventPosition: { x: number; y: number }) {
        const MAX_MOVE = 5;
        return (
            lastCanvasPosition &&
            Math.abs(lastCanvasPosition.x - eventPosition.x) <= MAX_MOVE &&
            Math.abs(lastCanvasPosition.y - eventPosition.y) <= MAX_MOVE
        );
    }

    // snippet:datasource_object_picking_2.ts
    const element = document.getElementById("mouse-picked-result") as HTMLPreElement;
    let current: PickResult | undefined;

    function handlePick(mapViewUsed: MapView, x: number, y: number) {
        // get an array of intersection results from MapView

        let usableIntersections = mapViewUsed
            .intersectMapObjects(x, y)
            .filter(item => item.userData !== undefined);
        if (usableIntersections.length > 1) {
            usableIntersections = usableIntersections.filter(item => item !== current);
        }

        if (usableIntersections.length === 0) {
            // Hide helper box
            element.style.visibility = "hidden";
            return;
        }

        // Get userData from the first result;
        current = usableIntersections[0];

        if (current.userData?.name !== undefined) {
            mapViewUsed.setDynamicProperty("selection", [current.userData.name]);
        }

        // Show helper box
        element.style.visibility = "visible";

        // Display userData inside of helper box
        element.innerText = JSON.stringify(current.userData, undefined, 2);
    }
    // end:datasource_object_picking_2.ts

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    async function initializeMapView(id: string) {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const selectionTheme: Theme = {
            styles: {
                tilezen: [
                    {
                        transient: true,
                        layer: "roads",
                        when: ["==", ["geometry-type"], "LineString"],
                        technique: "solid-line",
                        renderOrder: Number.MAX_SAFE_INTEGER,
                        enabled: [
                            "in",
                            ["get", "name"],
                            ["get", "selection", ["dynamic-properties"]]
                        ],
                        lineWidth: "2px"
                    },
                    {
                        transient: true,
                        layer: "landuse",
                        when: ["==", ["geometry-type"], "Polygon"],
                        technique: "solid-line",
                        renderOrder: Number.MAX_SAFE_INTEGER,
                        enabled: [
                            "in",
                            ["get", "name"],
                            ["get", "selection", ["dynamic-properties"]]
                        ],
                        lineWidth: "2px"
                    }
                ]
            }
        };

        const mapView = new MapView({
            canvas,
            theme: {
                extends: [selectionTheme, "resources/berlin_tilezen_base.json"]
            },
            enableRoadPicking: true,
            target: [-74.01, 40.707],
            zoomLevel: 18
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const controls = new MapControls(mapView);

        // Add an UI.
        const ui = new MapControlsUI(controls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        // snippet:datasource_object_picking_1.ts
        canvas.addEventListener("mousedown", event => {
            lastCanvasPosition = getCanvasPosition(event, canvas);
        });
        canvas.addEventListener("touchstart", event => {
            if (event.touches.length !== 1) {
                return;
            }
            lastCanvasPosition = getCanvasPosition(event.touches[0], canvas);
        });

        canvas.addEventListener("mouseup", event => {
            const canvasPos = getCanvasPosition(event, canvas);
            if (isPick(canvasPos)) {
                handlePick(mapView, canvasPos.x, canvasPos.y);
            }
        });
        canvas.addEventListener("touchend", event => {
            if (event.changedTouches.length !== 1) {
                return;
            }
            const canvasPos = getCanvasPosition(event.changedTouches[0], canvas);
            if (isPick(canvasPos)) {
                handlePick(mapView, canvasPos.x, canvasPos.y);
            }
        });

        // end:datasource_object_picking_1.ts

        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey,
            gatherFeatureAttributes: true
        });

        mapView.setDynamicProperty("selection", []);

        await mapView.addDataSource(omvDataSource);

        mapView.update();
    }
}
