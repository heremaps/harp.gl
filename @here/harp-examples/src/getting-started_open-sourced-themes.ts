/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { GUI } from "dat.gui";

import { apikey } from "../config";

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

    const omvDataSource = new VectorTileDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        authenticationCode: apikey
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
        .onChange(async (value: string) => {
            await mapView.setTheme(value);
        })
        .setValue("resources/berlin_tilezen_base.json");
}
