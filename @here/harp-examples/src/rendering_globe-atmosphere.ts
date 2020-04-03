/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { EarthConstants, GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    AtmosphereLightMode,
    CopyrightElementHandler,
    MapView,
    MapViewAtmosphere
} from "@here/harp-mapview";
import { APIFormat, AuthenticationMethod, OmvDataSource } from "@here/harp-omv-datasource";
import { WebTileDataSource } from "@here/harp-webtile-datasource";
import { apikey, copyrightInfo } from "../config";

export namespace GlobeAtmosphereExample {
    enum DataSourceVariant {
        Omv,
        Satellite
    }

    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            projection: sphereProjection,
            theme: "resources/berlin_tilezen_base_globe.json"
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
        const dataSourceVariant = window.location.href.toLowerCase().includes("datasource=omv")
            ? DataSourceVariant.Omv
            : DataSourceVariant.Satellite;

        let dataSource;
        if (dataSourceVariant === DataSourceVariant.Omv) {
            dataSource = new OmvDataSource({
                baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
                apiFormat: APIFormat.XYZOMV,
                styleSetName: "tilezen",
                maxZoomLevel: 17,
                authenticationCode: apikey,
                authenticationMethod: {
                    method: AuthenticationMethod.QueryString,
                    name: "apikey"
                },
                copyrightInfo
            });
        } else {
            dataSource = new WebTileDataSource({
                apikey,
                tileBaseAddress: WebTileDataSource.TILE_AERIAL_SATELLITE
            });
        }
        map.addDataSource(dataSource);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 90;
        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        map.canvas.parentElement!.appendChild(ui.domElement);

        const atmosphere = new MapViewAtmosphere(map);
        atmosphere.lightMode = AtmosphereLightMode.LightDynamic;

        const coords = new GeoCoordinates(10.0, -10.0);
        map.lookAt({ target: coords, distance: EarthConstants.EQUATORIAL_RADIUS * 2.1 });
    }

    main();
}
