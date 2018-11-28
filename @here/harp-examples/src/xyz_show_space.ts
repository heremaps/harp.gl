/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJsonDataSource } from "@here/harp-geojson-datasource/lib/GeoJsonDataSource";
import { XYZDataProvider } from "@here/harp-geojson-datasource/lib/XYZDataProvider";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { LoggerManager } from "@here/harp-utils";

/**
 * This example demonstrates how to use XYZ's REST API with the [[MapView]] map rendering SDK. As
 * for every case it is hereafter assumed that a [[MapView]] instance has been first created, and
 * then linked to a tile data source so a base map can be displayed.
 *
 * Then we add the [[XYZDataProvider]] and link it to a new [[GeoJSONDataSource]]. The latter is
 * added to the [[MapView]] instance:
 * ```typescript
 * [[include:xyz_1.ts]]
 * ```
 *
 * Then the link to XYZ's API is handled via an input field where the user can paste the URL of
 * the desired space. To then update the data source, a small function is needed to parse the URL:
 * ```typescript
 * [[include:xyz_2.ts]]
 * ```
 *
 * Alternatively the XYZ Url can be passed via a query parameter passed to the page url:
 * Usage:
 * `<the application url>?url=<the xyz url>`
 *
 * Then the url Query Parameter will be parsed so it can be used to update the MapView:
 * ```typescript
 * [[include:xyz_3.ts]]
 * ```
 */

const logger = LoggerManager.instance.create("xyz-space");

export namespace XYZExample {
    document.body.innerHTML += `
        <style>
            #xyz-input-box{
                bottom: 0;
                position: relative;
                opacity: 0.8;
                box-sizing: border-box;
            }
            #xyz-input, #theme-input{
                font-family: Arial, sans-serif;
                font-size: 0.9em;
                padding: 9px 12px;
                outline: none;
                margin: 5px;
                margin-bottom: 0;
                height: 34px;
                background-color: #e7e8e9;
                border: 0;
                border-right: 1px solid #c7c7c7;
                box-sizing: border-box;
                width: calc(100% - 225px);
                display: inline-block;
                vertical-align: middle;
            }
            #xyz-button, #theme-open, #theme-pasted, #theme-close{
                background: #37afaa;
                display: inline-block;
                height: 34px;
                color: white;
                border: none;
                width: 100px;
                vertical-align: bottom;
                cursor: pointer;
            }
            #theme-input{
                display: block;
                width: 500px;
                height: 300px;
                resize: vertical;
                max-height: 80%;
                margin-bottom: 10px;
            }
            #mouse-picked-result{
                position:absolute;
                bottom:5px;
                border-radius: 5px;
                margin-left:10px;
                padding: 9px 12px;
                background: #37afaa;
                display: inline-block;
                visibility: hidden;
            }
            #theme-box{
                background: rgba(0,0,0,0.5);
                position: absolute;
                top: 0;
                width: 100%;
                height: 100%;
                text-align: center;
            }
            #theme-box.hidden{
                display: none;
            }
            #theme-box.visible{
                display: block;
            }
            #theme-container, .valign{
                display: inline-block;
                vertical-align: middle;
            }
        </style>

        <pre id="mouse-picked-result"></pre>

        <div id="xyz-input-box">

            <input
                type="text"
                id="xyz-input"
                placeholder="Paste a full XYZ URL here."
            />

            <button id="xyz-button">Go</button>

            <button id="theme-open">Change theme</button>

        </div>

        <div id="theme-box" class="hidden">

            <div id="theme-container">
                <textarea
                    id="theme-input"
                    name="Gimme a json theme !"
                    placeholder="Paste a theme for the GeoJson data source here."
                ></textarea>

                <button id="theme-pasted">Ok</button>

                <button id="theme-close">Close</button>
            </div>

            <span class=valign style="height: 100%;"></span>

        </div>
    `;

    const defaultTheme = `
    {
        "styles": {"geojson": [
            {
                "description": "xyz geoJson Points.",
                "when": "type == 'point'",
                "renderOrder": 1000,
                "technique": "labeled-icon",
                "final": true,
                "attr": {
                    "imageTexture": "location",
                    "screenHeight": 32,
                    "scale": 0.5,
                    "yOffset": 2,
                    "priority": 105
                }
            },
            {
                "description": "xyz geoJson lines.",
                "when": "type == 'line'",
                "renderOrder": 1000,
                "technique": "solid-line",
                "attr": {
                    "color": "#37afaa",
                    "transparent": true,
                    "opacity": 0.5,
                    "metricUnit":"Pixel",
                    "lineWidth": [
                        {
                            "value": 3
                        }
                    ]
                }
            },
            {
                "description": "xyz geoJson polygon",
                "when": "type == 'polygon'",
                "renderOrder": 1000,
                "technique": "fill",
                "attr": {
                    "color": "#ffff00",
                    "transparent": true,
                    "opacity": 0.5
                }
            }
        ]
    }
    }`;

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });

    mapView.addDataSource(omvDataSource);

    const inputField = document.getElementById("xyz-input") as HTMLInputElement;
    const queryString = window.location.search;
    if (queryString.length > 0 && queryString.indexOf("space") === 1) {
        const xyzViewerUrl = queryString.substr(7);
        inputField.value = xyzViewerUrl;
        updateMapView(xyzViewerUrl);
    }

    initTextForm();

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const sampleMapView = new MapView({
            canvas,
            theme: "resources/reducedNight.json",
            enableRoadPicking: true
        });

        CopyrightElementHandler.install("copyrightNotice")
            .attach(sampleMapView)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        sampleMapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        sampleMapView.geoCenter = new GeoCoordinates(22, 0, 0);

        MapControls.create(sampleMapView);
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight);
        });

        canvas.addEventListener("mousedown", event => {
            handlePick(sampleMapView, event.pageX, event.pageY);
        });

        return sampleMapView;
    }

    function addGeoJsonDataSource(baseUrl: string, spaceId: string, token: string) {
        // snippet:xyz_1.ts
        const xyzDataProvider = new XYZDataProvider({ baseUrl, spaceId, token });
        const geoJsonDataSource = new GeoJsonDataSource({
            dataProvider: xyzDataProvider,
            name: "geojson"
        });
        mapView.addDataSource(geoJsonDataSource).then(() => {
            updateGeoJsonTheme(defaultTheme);
        });
        // end:xyz_1.ts
    }

    // snippet:xyz_2.ts
    function parseXYZSpaceUrl(urlString: string) {
        let spaceId = "";
        let token = "";
        let baseUrl = "";
        const url = new URL(urlString);
        baseUrl = url.origin + "/hub/spaces";
        const match = url.pathname.match(/.*\/hub\/spaces\/([^\/]*)\/.*/);
        if (match && match.length >= 2) {
            spaceId = match[1];
        }
        if (url.searchParams.has("access_token")) {
            token = url.searchParams.get("access_token") as string;
        }

        return {
            baseUrl,
            spaceId,
            token
        };
    }
    // end:xyz_2.ts

    function handlePick(mapViewUsed: MapView, x: number, y: number) {
        const intersectionResults = mapViewUsed.intersectMapObjects(x, y);
        if (intersectionResults.length > 0) {
            const element = document.getElementById("mouse-picked-result");
            if (element !== null) {
                const firstResult = intersectionResults[0];
                if (firstResult !== undefined) {
                    let objInfo;
                    if (firstResult.userData !== undefined) {
                        objInfo = firstResult.userData;
                    }

                    if (objInfo !== undefined) {
                        element.style.visibility = "visible";
                        element.innerHTML = JSON.stringify(objInfo, undefined, 2);
                    }
                }
            }
            logger.log(intersectionResults);
        }
    }

    function initTextForm() {
        const themeBox = document.getElementById("theme-box") as HTMLDivElement;
        const themeField = document.getElementById("theme-input") as HTMLTextAreaElement;

        inputField.addEventListener("keyup", e => {
            e.preventDefault();
            // Number 13 is the "Enter" key on the keyboard
            if (e.keyCode === 13) {
                const xyzUrl = inputField.value;
                updateMapView(xyzUrl);
            }
        });
        (document.getElementById("xyz-button") as HTMLButtonElement).addEventListener(
            "click",
            e => {
                const xyzUrl = inputField.value;
                updateMapView(xyzUrl);
            }
        );
        themeField.addEventListener("keyup", e => {
            e.preventDefault();
            // Number 13 is the "Enter" key on the keyboard
            if (e.keyCode === 13) {
                const jsonTheme = themeField.value;
                updateGeoJsonTheme(jsonTheme);
            }
        });
        themeField.value = defaultTheme;
        (document.getElementById("theme-open") as HTMLButtonElement).addEventListener(
            "click",
            e => {
                themeBox.classList.replace("hidden", "visible");
            }
        );
        (document.getElementById("theme-close") as HTMLButtonElement).addEventListener(
            "click",
            e => {
                if (themeBox !== null) {
                    themeBox.classList.replace("visible", "hidden");
                }
            }
        );
        (document.getElementById("theme-pasted") as HTMLButtonElement).addEventListener(
            "click",
            e => {
                if (themeField !== null) {
                    const jsonTheme = (themeField as HTMLTextAreaElement).value;
                    updateGeoJsonTheme(jsonTheme);
                }
                if (themeBox !== null) {
                    themeBox.classList.replace("visible", "hidden");
                }
            }
        );
    }

    // snippet:xyz_3.ts
    function updateMapView(xyzUrl: string) {
        const { baseUrl, spaceId, token } = parseXYZSpaceUrl(xyzUrl);
        const dataSource = mapView.getDataSourcesByStyleSetName("geojson")[0];
        if (dataSource === undefined) {
            addGeoJsonDataSource(baseUrl, spaceId, token);
        } else {
            // tslint:disable-next-line:max-line-length
            const xyzDataProvider = (dataSource as GeoJsonDataSource).dataProvider() as XYZDataProvider;
            xyzDataProvider.setParameters(baseUrl, spaceId, token);
        }
        window.parent.location.search = "?space=" + xyzUrl;
        clearTile();
        mapView.update();
    }
    // end:xyz_3.ts

    function updateGeoJsonTheme(theme: string) {
        const geoJsonDataSource = mapView.getDataSourcesByStyleSetName("geojson")[0];
        if (geoJsonDataSource !== undefined) {
            const geoJsonTheme = JSON.parse(theme);
            geoJsonDataSource.setStyleSet(geoJsonTheme.styles.geojson);
        }
    }

    function clearTile() {
        const element = document.getElementById("mouse-picked-result");
        if (element !== null && element !== undefined) {
            element.style.visibility = "hidden";
        }
        mapView.clearTileCache("geojson");
    }
}
