/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView, ThemeLoader } from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { apikey, copyrightInfo } from "../config";

/**
 * This example copies the base example and adds a GUI allowing to switch between all the open-
 * sourced themes available in the repository and OSM and HERE vector data.
 */
export namespace ThemesExample {
    function initializeMapView(): MapView {
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const map = new MapView({
            canvas,
            theme: "resources/standard_tilezen_base.json"
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const moscow = new GeoCoordinates(55.7525631, 37.6234006);
        map.lookAt({ target: moscow, zoomLevel: 16.1, tilt: 50, heading: 300 });
        map.zoomLevel = 16.1;

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input", projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        return map;
    }

    const mapView = initializeMapView();

    const hereVectorData = new OmvDataSource({
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

    const osmVectorData = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/512/all",
        apiFormat: APIFormat.XYZMVT,
        styleSetName: "tilezen",
        authenticationCode: "AGln99HORnqL1kfIQtsQl70"
    });

    const gui = new GUI({ width: 200 });
    const options = {
        theme: {
            day: "resources/berlin_tilezen_base.json",
            reducedDay: "resources/berlin_tilezen_day_reduced.json",
            reducedNight: "resources/berlin_tilezen_night_reduced.json",
            standard: "resources/standard_tilezen_base.json",
            streets: "resources/berlin_tilezen_effects_streets.json",
            outlines: "resources/berlin_tilezen_effects_outlines.json"
        },
        data: {
            here: 1,
            "open street map": 2
        }
    };
    gui.add(options, "theme", options.theme)
        .onChange((value: string) => {
            ThemeLoader.load(value).then(theme => {
                mapView.theme = theme;
            });
        })
        .setValue("resources/standard_tilezen_base.json");
    gui.add(options, "data", options.data)
        .onChange((value: string) => {
            switch (value) {
                case "1":
                    mapView.addDataSource(hereVectorData);
                    mapView.removeDataSource(osmVectorData);
                    break;
                case "2":
                    mapView.addDataSource(osmVectorData);
                    mapView.removeDataSource(hereVectorData);
                    break;
            }
        })
        .setValue("1");
}
