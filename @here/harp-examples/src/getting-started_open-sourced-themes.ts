/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, CopyrightInfo, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { accessToken } from "../config";

/**
 * This example copies the base example and adds a GUI allowing to switch between all the open-
 * sourced themes available in the repository.
 */
export namespace ThemesExample {
    function initializeMapView(): MapView {
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const NY = new GeoCoordinates(40.707, -74.01);
        map.lookAt(NY, 3500, 50);

        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        return map;
    }

    const mapView = initializeMapView();

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

    mapView.addDataSource(omvDataSource);

    const gui = new GUI({ width: 300 });
    const options = {
        theme: {
            day: "resources/berlin_tilezen_base.json",
            reducedDay: "resources/berlin_tilezen_day_reduced.json",
            reducedNight: "resources/berlin_tilezen_night_reduced.json",
            streets: "resources/berlin_tilezen_effects_streets.json",
            outlines: "resources/berlin_tilezen_effects_outlines.json"
        }
    };
    gui.add(options, "theme", options.theme)
        .onChange((value: string) => {
            fetch(value)
                .then(response => {
                    return response.json();
                })
                .then((theme: any) => {
                    mapView.theme = theme;
                });
        })
        .setValue("resources/berlin_tilezen_base.json");
}
