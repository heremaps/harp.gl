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

import { Theme, ThemeVisitor } from "@here/datasource-protocol";
import { GeoCoordinates } from "@here/geoutils";
import { LandmarkTileDataSource } from "@here/landmark-datasource";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { ThemeLoader } from "@here/mapview/lib/ThemeLoader";
import { OmvDataSource } from "@here/omv-datasource";
import { LoggerManager } from "@here/utils";
import { appCode, appId, hrn } from "../config";

const logger = LoggerManager.instance.create("verity_themes");

/**
 * This example shows a way to change a map's theme and how the adjustment of a theme's property can
 * be made, by allowing to change a single road color's channel property. Changing the theme is done
 * by utilizing the [[ThemeLoader]] class in the following way:
 *
 * ```typescript
 * [[include:vislib_maptheme_0.ts]]
 * ```
 * To change a single theme's property the utility class called [[ThemeVisitor]] can be used:
 *
 * ```typescript
 * [[include:vislib_maptheme_1.ts]]
 * ```
 */
export namespace ThemesExample {
    document.body.innerHTML += `
    <style>
        #switch-theme-btn {
            display: inline-block;
            background-color: rgba(255,255,255,0.5);
            margin: 20px 0 0 20px;
            padding: 10px; cursor: pointer;
            user-select: none;
        }

        .red-channel {
            margin: 20px 0 0 20px;
        }

        input[type=range] {
            width: 150px;
        }
    </style>
    <div id="switch-theme-btn">SWITCH THEME</div>

    <div class="red-channel">
        <input id="red-channel-slider" name="r" type="range" min="0" max="255" value="82"/>
    </div>
`;

    const availableThemes: string[] = ["./resources/theme.json", "./resources/reducedDay.json"];

    const defaultThemeUrl = availableThemes[0];

    // snippet:vislib_maptheme_0.ts
    // asynchronously loads Theme and applies it to MapView
    function loadMapViewTheme(mapViewToLoad: MapView, url: string) {
        ThemeLoader.loadAsync(url)
            .then((theme: Theme) => {
                mapViewToLoad.theme = theme;
            })
            .catch(error => {
                logger.error("#loadMapViewTheme: failed to load map theme", error);
            });
    }
    // end:vislib_maptheme_0.ts

    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: defaultThemeUrl
        });

        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 800);
        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // instantiate the default map controls, allowing the user to pan around freely.
        // tslint:disable-next-line:no-unused-expression
        new MapControls(sampleMapView);

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight);

        // react on resize events
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

    function initSwitchThemeButton() {
        const el = document.getElementById("switch-theme-btn");
        if (el === null) {
            return;
        }

        let themeIdx = 0;

        el.onclick = () => {
            themeIdx++;

            const nextThemeUrl = availableThemes[themeIdx % availableThemes.length];

            loadMapViewTheme(mapView, nextThemeUrl);
        };
    }

    function initChangeRedChannelSlider() {
        const el = document.getElementById("red-channel-slider") as HTMLInputElement;

        if (el === null) {
            return;
        }

        // snippet:vislib_maptheme_1.ts
        el.onchange = () => {
            const theme = mapView.theme;
            if (theme === undefined) {
                return;
            }

            const value = parseInt(el.value, 10);

            let hexVal = value.toString(16);

            if (hexVal.length === 1) {
                hexVal = "0" + hexVal;
            }

            const styleVisitor = new ThemeVisitor(theme);

            styleVisitor.visitStyles(style => {
                // change only roads red channel - #xx606e in night theme and #xxfeff in day theme
                if (
                    style.attr !== undefined &&
                    style.attr.color &&
                    ((style.attr.color as string).endsWith("606e") ||
                        (style.attr.color as string).endsWith("feff"))
                ) {
                    style.attr.color = "#" + hexVal + (style.attr.color as string).substr(3);
                }

                return false;
            });

            mapView.theme = theme;
        };
        // end:vislib_maptheme_1.ts
    }

    window.onload = () => {
        initSwitchThemeButton();
        initChangeRedChannelSlider();
    };
}
