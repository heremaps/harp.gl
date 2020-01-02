/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { DebugTileDataSource } from "@here/harp-debug-datasource";
import { GeoCoordinates, webMercatorTilingScheme } from "@here/harp-geoutils";
import { CopyrightElementHandler, FixedClipPlanesEvaluator, MapView } from "@here/harp-mapview";
import { OmvDataSource } from "@here/harp-omv-datasource";
import { WebTileDataSource } from "@here/harp-webtile-datasource";

import * as THREE from "three";
import "three/examples/js/controls/OrbitControls";

import { accessToken, appCode, appId, copyrightInfo } from "../config";
export namespace OrbitControlsExample {
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        // Look at New York.
        const NY = new GeoCoordinates(40.707, -74.01, -500);
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json",
            target: NY,
            tilt: 50,
            heading: -20,
            zoomLevel: 16.0,
            // projection: sphereProjection
            clipPlanesEvaluator: new FixedClipPlanesEvaluator(0.1, 10000)
        });

        const orbitControls = new (THREE as any).OrbitControls(map.camera, canvas);
        map.projection.projectPoint(NY, orbitControls.target);
        orbitControls.update();
        orbitControls.addEventListener("change", () => {
            map.update();
        });

        CopyrightElementHandler.install("copyrightNotice", map);
        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addOmvDataSource(map);

        const webTileDS = new WebTileDataSource({
            appId,
            appCode,
            ppi: WebTileDataSource.ppiValue.ppi320,
            renderingOptions: {
                opacity: 0.5
            }
        });
        map.addDataSource(webTileDS);
        map.addDataSource(new DebugTileDataSource(webMercatorTilingScheme));

        return map;
    }

    function addOmvDataSource(map: MapView) {
        const omvDataSource = new OmvDataSource({
            url: "https://xyz.api.here.com/tiles/herebase.02/{z}/{x}/{y}/omv",
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            urlParams: {
                access_token: accessToken
            },
            copyrightInfo
        });
        map.addDataSource(omvDataSource);
        // Disable for now b/c we also allow the camera to be below the ground.
        omvDataSource.enabled = false;
        return map;
    }

    export const mapView = initializeMapView("mapCanvas");
}
