/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";

/**
 * With the GeoJson format, objects are arranged into features, and each feature can bear custom
 * properties. [[MapView]]'s support for GeoJson includes access to these custom properties in the
 * [[Style]], to refine maps according to every possible information available.
 *
 * First a base map is created with [[MapView]] and the [[OmvDataSource]].
 * ```typescript
 * [[include:geojson_property_styling1.ts]]
 * ```
 *
 * Then the GeoJson in use will be a map of Italy. Each feature of this GeoJson represents a region
 * of the country, and each feature holds the name of the region. To illustrate property styling,
 * a [[StyleSet]] is created, and each [[Style]] defines what name it should match through the
 * `when` [[Expr]].
 * ```typescript
 * [[include:geojson_property_styling2.ts]]
 * ```
 * Properties nested in objects or arrays can also be accessed the same way, as one would do in
 * JavaScript. For instance: `properties.myArray[1].key2`.
 *
 * Finally a [[DataSource]] is created and added to [[MapView]], and the above [[StyleSet]]
 * is passed afterwards:
 * ```typescript
 * [[include:geojson_property_styling3.ts]]
 * ```
 */
export namespace GeoJsonPropertyStylingExample {
    document.body.innerHTML += `
        <style>
        #theme-input{
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
        #theme-open{
            left: 50%;
            position: absolute;
            margin-left: -50px;
        }
        #theme-open, #theme-pasted, #theme-close{
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
            height: 500px;
            resize: vertical;
            max-height: 80%;
            margin-bottom: 10px;
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

        <button id="theme-open">Change theme</button>

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

    // snippet:geojson_property_styling2.ts
    const theme = `{
        "styles": {
            "geojson": [
                {
                    "description": "Technique for all regions but Toscana.",
                    "when": "$geometryType == 'polygon' && name != 'toscana'",
                    "renderOrder": 1000,
                    "technique": "fill",
                    "attr": {
                        "color": "#ff0000",
                        "transparent": true,
                        "opacity": 0.5
                    }
                },
                {
                    "description": "Technique for Toscana.",
                    "when": "$geometryType == 'polygon' && name == 'toscana'",
                    "renderOrder": 1000,
                    "technique": "fill",
                    "attr": {
                        "color": "#ffaa00",
                        "transparent": true,
                        "opacity": 0.5
                    }
                }
            ]
        }
    }`;
    // end:geojson_property_styling2.ts

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeBaseMap(id: string): MapView {
        // snippet:geojson_property_styling1.ts
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme: "resources/reducedNight.json"
        });

        CopyrightElementHandler.install("copyrightNotice")
            .attach(mapView)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        mapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        mapView.geoCenter = new GeoCoordinates(16, -4, 0);

        MapControls.create(mapView);
        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        const baseMapDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.MapzenV2,
            styleSetName: "tilezen",
            maxZoomLevel: 17
        });
        mapView.addDataSource(baseMapDataSource);
        // end:geojson_property_styling1.ts

        return mapView;
    }

    const baseMap = initializeBaseMap("mapCanvas");

    // snippet:geojson_property_styling3.ts
    const geoJsonDataProvider = new GeoJsonDataProvider(
        new URL("resources/italy.json", window.location.href)
    );
    const geoJsonDataSource = new OmvDataSource({
        dataProvider: geoJsonDataProvider,
        name: "geojson",
        styleSetName: "geojson"
    });
    baseMap.addDataSource(geoJsonDataSource).then(() => {
        geoJsonDataSource.setStyleSet(JSON.parse(theme).styles.geojson);
    });
    // end:geojson_property_styling3.ts

    initTextForm();

    function initTextForm() {
        const themeOpen = document.getElementById("theme-open") as HTMLButtonElement | null;
        const themeClose = document.getElementById("theme-close") as HTMLButtonElement | null;
        const themePasted = document.getElementById("theme-pasted") as HTMLButtonElement | null;
        const themeField = document.getElementById("theme-input") as HTMLTextAreaElement | null;
        const themeBox = document.getElementById("theme-box") as HTMLDivElement | null;
        if (themeField !== null) {
            themeField.addEventListener("keyup", e => {
                e.preventDefault();
                // Number 13 is the "Enter" key on the keyboard
                if (e.keyCode === 13) {
                    const jsonTheme = themeField.value;
                    updateGeoJsonTheme(jsonTheme);
                }
            });
            themeField.value = theme;
        }
        if (themeOpen !== null) {
            themeOpen.addEventListener("click", e => {
                if (themeBox !== null) {
                    themeBox.classList.replace("hidden", "visible");
                }
            });
        }
        if (themeClose !== null) {
            themeClose.addEventListener("click", e => {
                if (themeBox !== null) {
                    themeBox.classList.replace("visible", "hidden");
                }
            });
        }
        if (themePasted !== null) {
            themePasted.addEventListener("click", e => {
                if (themeField !== null) {
                    const jsonTheme = (themeField as HTMLTextAreaElement).value;
                    updateGeoJsonTheme(jsonTheme);
                }
                if (themeBox !== null) {
                    themeBox.classList.replace("visible", "hidden");
                }
            });
        }
    }

    function updateGeoJsonTheme(value: string) {
        geoJsonDataSource.setStyleSet(JSON.parse(value).styles.geojson);
    }
}
