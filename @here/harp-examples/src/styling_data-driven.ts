/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { apikey, copyrightInfo } from "../config";

export namespace DataDrivenThemeExample {
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
    <p id=info>This example shows how to utilize the data from the styles.<br/>` +
        `Here the population of a country is displayed below its name.</p>`;
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme: {
                extends: "resources/berlin_tilezen_base.json",
                definitions: {
                    countryPopulationLevel: {
                        type: "number",
                        value: ["-", ["log10", ["number", ["get", "population"], 1000]], 3]
                    }
                },
                styles: {
                    population: [
                        ["ref", "countryBorderOutline"],
                        ["ref", "waterPolygons"],
                        {
                            when: [
                                "all",
                                ["==", ["get", "$layer"], "places"],
                                ["==", ["get", "kind"], "country"]
                            ],
                            technique: "text",
                            attr: {
                                priority: ["+", 100, ["^", 2, ["ref", "countryPopulationLevel"]]],
                                size: ["+", 8, ["^", 1.7, ["ref", "countryPopulationLevel"]]],
                                text: [
                                    "concat",
                                    ["coalesce", ["get", "name:en"], ["get", "name"]],
                                    "\n",
                                    ["coalesce", ["get", "population"], "n/a"]
                                ],
                                color: "#3F1821",
                                backgroundColor: "#FFFFFF",
                                backgroundOpacity: 0.7,
                                fontVariant: "SmallCaps",
                                opacity: 0.9
                            }
                        }
                    ]
                }
            },
            disableFading: true,
            target: new GeoCoordinates(50.443041, 11.4229649),
            zoomLevel: 5
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return mapView;
    }

    function main() {
        const map = initializeMapView("mapCanvas");

        const omvDataSource = new OmvDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "population",
            authenticationCode: apikey,
            authenticationMethod: {
                method: AuthenticationMethod.QueryString,
                name: "apikey"
            },
            copyrightInfo
        });

        const mapControls = MapControls.create(map);

        const ui = new MapControlsUI(mapControls);
        map.canvas.parentElement!.appendChild(ui.domElement);

        map.addDataSource(omvDataSource);
    }

    main();
}
