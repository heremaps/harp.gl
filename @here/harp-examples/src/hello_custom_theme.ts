/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, CopyrightInfo, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

/**
 * This example shows how to customize builtin `Berlin` theme using [Theme] `definition` mechanism.
 *
 * > NOTE:
 * > This example focuses on [[Theme]] customization. Please refer to [[HelloWorldExample]] for
 * > introduction how to use [[MapView]]
 *
 * [Theme]s can inherit from another theme by using `extends: URL` property:
 *
 * ```typescript
 * [[include:harp_gl_hello_custom_theme_0.ts]]
 * ```
 *
 * To override features of base theme, properties must be specified as `definition` in base `Theme`
 * like this. For example, _park color_ is defined as `parkColor` definition like below:
 *
 * ```json
 * "definitions": {
 *   "parkColor": {
 *     "type": "color",
 *     "value": "#6C9478"
 *   }
 * }
 * ```
 *
 * This definition, is later used in base theme as reference to definition:
 *
 * ```json
 * "technique": "fill",
 * "attrs": {
 *   "color": {
 *     "$ref": "parkColor"
 *   },
 *   ...
 * }
 * ```
 */

export namespace HelloCustomThemeExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const map = new MapView({
            canvas,
            // snippet:harp_gl_hello_custom_theme_0.ts
            theme: {
                extends: "resources/berlin_tilezen_base.json",
                // end:harp_gl_hello_custom_theme_0.ts
                definitions: {
                    parkColor: {
                        type: "color",
                        value: "green"
                    },
                    extrudedBuildings: {
                        technique: "fill",
                        when: ["ref", "extrudedBuildingsCondition"],
                        attr: {
                            color: "brown"
                        }
                    }
                }
            }
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxPitchAngle = 50;

        // Look at New York.
        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt(NY, 4000, 50, -20);

        // Add an UI.
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addOmvDataSource(map);

        return map;
    }

    function addOmvDataSource(map: MapView) {
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

        map.addDataSource(omvDataSource);

        return map;
    }

    initializeMapView("mapCanvas");
}
