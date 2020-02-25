/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken, copyrightInfo } from "../config";

import { GUI } from "dat.gui";

export namespace ObjectSelectionExample {
    function main(id: string = "mapCanvas") {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        // Look at New York.
        const NY = new GeoCoordinates(40.707, -74.01);
        const map = new MapView({
            canvas,
            theme: "resources/object_selection.json",
            target: NY,
            heading: -20,
            zoomLevel: 16.1
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        const omvDataSource = new OmvDataSource({
            url: "https://xyz.api.here.com/tiles/herebase.02/{z}/{x}/{y}/omv",
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            urlParams: {
                access_token: accessToken
            },
            copyrightInfo,
            gatherFeatureAttributes: true
        });

        map.addDataSource(omvDataSource);

        const gui = new GUI({ width: 300 });

        const settings = {
            Roads: "Liberty",
            MinHeight: 40
        };

        map.setDynamicProperty("selected", settings.Roads);
        map.setDynamicProperty("min-height", settings.MinHeight);

        gui.add(settings, "Roads").onFinishChange(value => {
            map.setDynamicProperty("selected", value);
            map.update();
        });

        gui.add(settings, "MinHeight").onFinishChange(value => {
            map.setDynamicProperty("min-height", value);
            map.update();
        });
    }

    main();
}
