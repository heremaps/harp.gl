/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView, MapViewUtils } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

import { apikey, copyrightInfo } from "../config";

/**
 * An example showing triple map view build with 3 [[MapView]]s each with a different theme and/or
 * datasource.
 *
 * Creates 3 views with their own MapView and MapControl as WebTileDataSourceOptions:
 * ```typescript
 * [[include:harp_gl_multiview_tripleView_1.ts]]
 * ```
 *
 * Create 3 separate [[MapView]]s and datasources that will populate them.
 * ```typescript
 * [[include:harp_gl_multiview_tripleView_2.ts]]
 * ```
 * After adding the MapViews and their dedicated datasources (each one possibly with different
 * theme, added event handlers to sync between them [[MapView]]s:
 * ```typescript
 * [[include:harp_gl_multiview_tripleView_3.ts]]
 * ```
 */

export namespace TripleViewExample {
    // inject HTML code to page to show additional map canvases and position them side-by-side
    document.body.innerHTML += getExampleHTML();

    const numberOfSyncXViews = 3;
    // Adjust CSS to see more then 1 row in Y axis
    const numberOfSyncYViews = 1;

    interface ViewControlPair {
        mapView: MapView;
        mapControls: MapControls;
    }

    function setupSyncViewsGrid(mapView: MapView, gridPosX: number, gridPosY: number) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const chunkW = window.innerWidth / numberOfSyncXViews;
        const chunkH = window.innerHeight / numberOfSyncYViews;
        // force camera aspect
        mapView.forceCameraAspect = winW / winH;
        // resize the mapView to maximum
        if (gridPosX !== 1) {
            mapView.resize(chunkW, chunkH);
            mapView.camera.setViewOffset(
                winW,
                winH,
                gridPosX * chunkW,
                gridPosY * chunkH,
                chunkW,
                chunkH
            );
        } else {
            mapView.resize(winW, winH);
        }
    }

    function initMapView(
        id: string,
        gridPositionX: number,
        gridPositionY: number,
        theme: string,
        decoderUrl: string
    ): ViewControlPair {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme,
            decoderUrl
        });
        CopyrightElementHandler.install("copyrightNotice", mapView);

        // instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(mapView);

        // Add an UI.
        if (gridPositionX === 1) {
            const ui = new MapControlsUI(mapControls);
            canvas.parentElement!.appendChild(ui.domElement);
        }

        const frankfurt = new GeoCoordinates(50.1125867, 8.6720831);
        mapView.lookAt({ target: frankfurt, zoomLevel: 18, tilt: 45, heading: 200 });
        mapView.zoomLevel = 16.2;

        setupSyncViewsGrid(mapView, gridPositionX, gridPositionY);
        // react on resize events
        window.addEventListener("resize", () => {
            setupSyncViewsGrid(mapView, gridPositionX, gridPositionY);
        });

        return { mapView, mapControls };
    }

    // create `${numberOfSyncXViews}` MapViews, each with their own theme file
    // snippet:harp_gl_multiview_tripleView_1.ts
    const mapViews = {
        view1: initMapView(
            "mapCanvas",
            0,
            0,
            "./resources/berlin_tilezen_base.json",
            "./decoder.bundle.js"
        ),
        view2: initMapView(
            "mapCanvas2",
            1,
            0,
            "./resources/berlin_tilezen_night_reduced.json",
            "./decoder.bundle.js"
        ),
        view3: initMapView(
            "mapCanvas3",
            2,
            0,
            "./resources/berlin_tilezen_day_reduced.json",
            "./decoder.bundle.js"
        )
    };
    // end:harp_gl_multiview_tripleView_1.ts

    // snippet:harp_gl_multiview_tripleView_2.ts
    const xyzDataSourceParams = {
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        },
        copyrightInfo
    };
    const dataSources = {
        omvDataSource1: new VectorTileDataSource(xyzDataSourceParams),
        omvDataSource2: new VectorTileDataSource(xyzDataSourceParams),
        omvDataSource3: new VectorTileDataSource(xyzDataSourceParams)
    };

    mapViews.view1.mapView.addDataSource(dataSources.omvDataSource1);
    mapViews.view2.mapView.addDataSource(dataSources.omvDataSource2);
    mapViews.view3.mapView.addDataSource(dataSources.omvDataSource3);
    // end:harp_gl_multiview_tripleView_2.ts

    const syncMapViews = (srcView: ViewControlPair, destView: ViewControlPair) => {
        const ypr = srcView.mapControls.attitude;
        MapViewUtils.setRotation(destView.mapView, ypr.yaw, ypr.pitch);
        destView.mapView.camera.position.copy(srcView.mapView.camera.position);
        destView.mapControls.cameraHeight = srcView.mapControls.cameraHeight;
        destView.mapView.camera.aspect = numberOfSyncXViews;
        destView.mapView.camera.updateProjectionMatrix();

        // force update on changed MapView
        destView.mapView.update();
    };

    mapViews.view2.mapControls.addEventListener("update", () => {
        syncMapViews(mapViews.view2, mapViews.view1);
        syncMapViews(mapViews.view2, mapViews.view3);
    });
    // end:harp_gl_multiview_tripleView_3.ts

    function getExampleHTML() {
        return `
            <style>
                .themeName {
                    font-weight: bold;
                    padding: 1em;
                    position: absolute
                    margin-bottom: 0.5em;
                    margin: 0 auto;
                    width: 33%;
                    text-align:center;
                    text-transform:uppercase;
                    font-family: 'Fira Sans', sans-serif;
                }

                .titleRow
                {
                    display: table;
                    table-layout: fixed;
                    width: 100%;
                }

                #mapTheme1,#mapTheme2,#mapTheme3 {
                    background: hsl(218, 17%, 18%);
                    color: hsl(218, 17%, 85%);
                    display: table-cell;
                    left: 66%;
                }

                #mapCanvas {
                    border: 0px;
                    height: 100%;
                    left: 0;
                    overflow: hidden;
                    position: absolute;
                    pointer-events:none;
                    width: calc(100%/3);
                    z-index: -1
                }

                #mapCanvas2 {
                    border: 0px;
                    height: 100%;
                    left: 0;
                    overflow: hidden;
                    position: absolute;
                    width: 100%;
                    z-index: -2
                }

                #mapCanvas3 {
                    border: 0px;
                    height: 100%;
                    left: 66.6%;
                    pointer-events:none;
                    overflow: hidden;
                    position: absolute;
                    width: calc(100%/3);
                    z-index: -1
                }

            </style>

            <canvas id="mapCanvas2"></canvas>
            <canvas id="mapCanvas3"></canvas>
            <div class="titleRow">
                <div class="themeName" id="mapTheme1">
                    Base theme
                </div>
                <div class="themeName" id="mapTheme2">
                    Night reduced theme
                </div>
                <div class="themeName" id="mapTheme3">
                    Day reduced theme
                </div>
            </div>
        `;
    }
}
