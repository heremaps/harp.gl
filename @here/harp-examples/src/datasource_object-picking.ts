/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView, PickResult } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken, copyrightInfo } from "../config";

/**
 * This example showcases how picking works.
 *
 * To enable line picking set `enableRoadPicking: true` in [[MapViewOptions]] and set
 * `createTileInfo: true` in [[OmvWithRestClientParams]] or in [[OmvWithCustomDataProvider]].
 * To enable polygon picking set `gatherFeatureIds: true` in
 * [[OmvWithRestClientParams]] or in [[OmvWithCustomDataProvider]].
 * To enable text element picking set `gatherFeatureIds: true` in
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
            }
            #mapCanvas {
              top: 0;
            }
        </style>

        <pre id="mouse-picked-result"></pre>
    `;

    initializeMapView("mapCanvas").catch(err => {
        throw err;
    });

    // snippet:datasource_object_picking_2.ts
    const element = document.getElementById("mouse-picked-result") as HTMLPreElement;
    let currentUserData: PickResult | undefined;

    function handlePick(mapViewUsed: MapView, x: number, y: number) {
        // get an array of intersection results from MapView

        let usableIntersections = mapViewUsed
            .intersectMapObjects(x, y)
            .filter(item => item.userData !== undefined);
        if (usableIntersections.length > 1) {
            usableIntersections = usableIntersections.filter(
                item => item.userData !== currentUserData
            );
        }

        if (usableIntersections.length === 0) {
            // Hide helper box
            element.style.visibility = "hidden";
            return;
        }

        // Get userData from the first result;
        currentUserData = usableIntersections[0].userData;

        // Show helper box
        element.style.visibility = "visible";

        // Display userData inside of helper box
        element.innerText = JSON.stringify(currentUserData, undefined, 2);
    }
    // end:datasource_object_picking_2.ts

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    async function initializeMapView(id: string) {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json",
            enableRoadPicking: true
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const controls = new MapControls(mapView);

        // Add an UI.
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        // snippet:datasource_object_picking_1.ts
        canvas.addEventListener("mousedown", event => {
            handlePick(mapView, event.pageX, event.pageY);
        });
        // end:datasource_object_picking_1.ts

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            gatherFeatureIds: true,
            createTileInfo: true,
            copyrightInfo
        });

        await mapView.addDataSource(omvDataSource);

        mapView.update();
    }
}
