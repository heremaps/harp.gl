/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, CopyrightInfo, MapView, MapViewUtils } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

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
    document.body.innerHTML += `

<style>

    .themeName {
        font-weight: bold;
        padding: 1em;
        position: absolute
        margin-bottom: 0.5em;
        margin: 0 auto;
        width: 33%;
    }

    .titleRow
    {
        display: table;
        table-layout: fixed;
        width: 100%;
    }

    #mapTheme1 {
        background-color: rgba(0, 128, 128, 0.8);
        color: rgba(255, 255, 255, 0.8);
        display: table-cell;
    }

    #mapTheme2 {
        background-color: rgba(64, 128, 128, 0.8);
        color: rgba(255, 250, 200, 0.8);
        display: table-cell;
        left: 33%;
    }

    #mapTheme3 {
        background-color: rgba(255, 255, 255, 0.8);
        color: rgba(0, 128, 128, 0.9);
        display: table-cell;
        left: 66%;
    }

    #mapCanvas {
        border: 0px;
        height: 100%;
        left: 0;
        overflow: hidden;
        position: absolute;
        width: calc(100%/3);
        z-index: -1
    }

    #mapCanvas2 {
        border: 0px;
        height: 100%;
        left: 33.3%;
        overflow: hidden;
        position: absolute;
        width: calc(100%/3);
        z-index: -1
    }

    #mapCanvas3 {
        border: 0px;
        height: 100%;
        left: 66.6%;
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
        Data:<em> OMV</em><br/> Theme: <em>Base</em>
    </div>
    <div class="themeName" id="mapTheme2">
        Data:<em> OMV</em><br/> Theme: <em>Dark</em>
    </div>
    <div class="themeName" id="mapTheme3">
        Data:<em> OMV</em><br/> Theme: <em>Reduced</em>
    </div>
</div>
`;

    const defaultTheme = "./resources/berlin_tilezen_day_reduced.json";
    const numberOfSyncXViews = 3;
    // Adjust CSS to see more then 1 row in Y axis
    const numberOfSyncYViews = 1;
    const defaultZoomLevel = 14;

    /**
     * A pair of MapView and MapController.
     */
    export interface ViewControlPair {
        mapView: MapView;
        mapControls: MapControls;
    }

    export function setupSyncViewsGrid(mapView: MapView, gridPosX: number, gridPosY: number) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const chunkW = window.innerWidth / numberOfSyncXViews;
        const chunkH = window.innerHeight / numberOfSyncYViews;
        // force camera aspect
        mapView.forceCameraAspect = winW / winH;
        // resize the mapView to maximum
        mapView.resize(chunkW, chunkH);

        // let the camera float over the map, looking straight down
        mapView.camera.setViewOffset(
            winW,
            winH,
            gridPosX * chunkW,
            gridPosY * chunkH,
            chunkW,
            chunkH
        );
    }

    /**
     * Creates the pair of MapView and MapControllers required to sync the views.
     *
     * @param id ID of HTML canvas element
     * @param theme URL of theme to load
     * @param decoderUrl URL of decoder bundle
     */
    export function initMapView(
        id: string,
        gridPositionX: number,
        gridPositionY: number,
        theme?: string,
        decoderUrl?: string
    ): ViewControlPair {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme: theme !== undefined ? theme : defaultTheme,
            decoderUrl
        });
        CopyrightElementHandler.install("copyrightNotice", mapView);
        mapView.camera.position.set(0, 0, 800);

        // instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(mapView);

        // Add an UI.
        if (gridPositionX === 1) {
            const ui = new MapControlsUI(mapControls);
            canvas.parentElement!.appendChild(ui.domElement);
        }

        //Set the cameras height according to the given zoom level.
        mapView.camera.position.setZ(
            MapViewUtils.calculateDistanceToGroundFromZoomLevel(mapView, defaultZoomLevel)
        );

        // center the camera somewhere around Berlin geo locations
        mapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

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
    const hereCopyrightInfo: CopyrightInfo = {
        id: "here.com",
        year: new Date().getFullYear(),
        label: "HERE",
        link: "https://legal.here.com/terms"
    };
    const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

    const xyzDataSourceParams = {
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        maxZoomLevel: 17,
        authenticationCode: accessToken,
        copyrightInfo: copyrights
    };
    const dataSources = {
        omvDataSource1: new OmvDataSource(xyzDataSourceParams),
        omvDataSource2: new OmvDataSource(xyzDataSourceParams),
        omvDataSource3: new OmvDataSource(xyzDataSourceParams)
    };

    mapViews.view1.mapView.addDataSource(dataSources.omvDataSource1);
    mapViews.view2.mapView.addDataSource(dataSources.omvDataSource2);
    mapViews.view3.mapView.addDataSource(dataSources.omvDataSource3);
    // end:harp_gl_multiview_tripleView_2.ts

    /**
     * A function that copies the position and orientation of one MapView/MapControl to the others.
     *
     * @param srcView Source with MapView with current location and MapControl with current camera
     *                  position and orientation
     * @param destView Destination MapView synced to current location; MapControl synced to current
     *                  position and orientation
     */
    // snippet:harp_gl_multiview_tripleView_3.ts
    export const syncMapViews = (srcView: ViewControlPair, destView: ViewControlPair) => {
        const ypr = srcView.mapControls.yawPitchRoll;
        destView.mapControls.setRotation(ypr.yaw, ypr.pitch);
        destView.mapView.worldCenter.copy(srcView.mapView.worldCenter);
        destView.mapControls.cameraHeight = srcView.mapControls.cameraHeight;
        //destView.mapView.camera.aspect = numberOfSyncXViews;
        destView.mapView.camera.updateProjectionMatrix();

        // force update on changed MapView
        destView.mapView.update();
    };

    const views = [mapViews.view1, mapViews.view2, mapViews.view3];

    // sync camera of each view to other views changes.
    views.forEach((v: ViewControlPair, index: number) => {
        const otherViews = views.slice();
        otherViews.splice(index, 1);
        // tslint:disable-next-line:no-unused-variable
        otherViews.forEach((otherView: ViewControlPair, indexTemp: number) => {
            v.mapControls.addEventListener(
                "update",
                (): void => {
                    syncMapViews(views[index], otherViews[indexTemp]);
                }
            );
        });
    });
    // end:harp_gl_multiview_tripleView_3.ts
}
