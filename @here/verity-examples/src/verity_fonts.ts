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
import { LandmarkTileDataSource } from "@here/landmark-datasource";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { OmvDataSource } from "@here/omv-datasource";
import { appCode, appId, hrn } from "../config";

/**
 * MapView initialization sequence enables setting fonts styling by theme file.
 * Theme is passed as constructor parameter.
 *
 * ```typescript
 * [[include:vislib_hello_world_example_0.ts]]
 * ```
 *
 * Fonts are defined in the theme file by "fonts" tag, for example:
 *     "fonts": [
 *          {
 *              "name": "firaMono",
 *              "url": "resources/FiraMono.fnt"
 *          }
 *      ],
 * Styles, are defined by "textStyles" tag:
 *     "textStyles": [
 *          {
 *              "name": "exampleStyle1",
 *              "color": "#6d7477",
 *              "outlineColor": "#F7FBFD",
 *              "outlineFactor": 5.0,
 *              "outlineAlpha": 0.75,
 *              "heavy": true,
 *              "fontName": "firaMono"
 *          },
 * "Fontname" is a reference to font defined in fonts section.
 * Style is associated with technique by new style tag:
 *  {
 *      "technique": "text",
 *           "attr": {
 *              "color": "#6d7477",
 *              "scale": 0.75,
 *              "style": "exampleStyle1"
 *            }
 *  }
 */
export namespace FontsExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        // snippet:vislib_hello_world_example_0.ts
        const sampleMapView = new MapView({
            canvas,
            theme: "resources/dayTwoFonts.json"
        });
        // end:vislib_hello_world_example_0.ts

        sampleMapView.camera.position.set(0, 0, 800);
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        MapControls.create(sampleMapView);

        sampleMapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        return sampleMapView;
    }

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new OmvDataSource({
        hrn,
        appId,
        appCode
    });

    const landmarkTileDataSource = new LandmarkTileDataSource({
        hrn,
        appId,
        appCode
    });

    mapView.addDataSource(omvDataSource);
    mapView.addDataSource(landmarkTileDataSource);
}
