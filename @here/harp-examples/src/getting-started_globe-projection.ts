/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    PolarTileDataSource
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

export namespace GlobeExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base_globe.json",
            maxVisibleDataSourceTiles: 360,
            projection: sphereProjection
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

        const polarDataSource = new PolarTileDataSource({
            styleSetName: "tilezen"
        });

        map.addDataSource(omvDataSource);
        map.addDataSource(polarDataSource);

        const mapControls = new MapControls(map);
        const ui = new MapControlsUI(mapControls);
        map.canvas.parentElement!.appendChild(ui.domElement);

        map.setCameraGeolocationAndZoom(new GeoCoordinates(40.6935, -74.009), 4);
    }

    main();
}
