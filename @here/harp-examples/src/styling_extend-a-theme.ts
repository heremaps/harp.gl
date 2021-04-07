/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

import { apikey, copyrightInfo } from "../config";

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
    document.body.innerHTML +=
        `
    <style>
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
    <p id=info>This example shows the theme extension mechanism: the styles for the parks ` +
        `and the buildings are overwritten from an original theme to make them respectively green` +
        ` and brown.</p>
`;
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
                        value: "#00aa33"
                    }
                },
                styles: {
                    tilezen: [
                        {
                            // overrides the `extrudedBuildings` style
                            // to use the fill technique instead of
                            // extruded polygons.
                            id: "extrudedBuildings",
                            technique: "fill",
                            when: ["ref", "extrudedBuildingsCondition"],
                            color: ["ref", "defaultBuildingColor"]
                        }
                    ]
                }
            }
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        // Instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        // Look at New York.
        const rome = new GeoCoordinates(41.9005332, 12.494249);
        map.lookAt({ target: rome, zoomLevel: 16.1, tilt: 50, heading: 200 });
        map.zoomLevel = 16.1;

        // Add an UI.
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        // Resize the mapView to maximum.
        map.resize(window.innerWidth, window.innerHeight);

        // React on resize events.
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addVectorTileDataSource(map);

        return map;
    }

    function addVectorTileDataSource(map: MapView) {
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

    initializeMapView("mapCanvas");
}
