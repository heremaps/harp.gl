/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { MapView, MapViewUtils } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";

/**
 * An example showing triple map view build with 3 [[MapView]]s each with a different theme and/or
 * datasource.
 *
 * Creates 3 views with their own MapView and MapControl as WebTileDataSourceOptions:
 * ```typescript
 * [[include:vislib_multiview_tripleView_1.ts]]
 * ```
 *
 * Create 3 separate [[MapView]]s and datasources that will populate them.
 * ```typescript
 * [[include:vislib_multiview_tripleView_2.ts]]
 * ```
 * After adding the MapViews and their dedicated datasources (each one possibly with different
 * theme, added event handlers to sync between them [[MapView]]s:
 * ```typescript
 * [[include:vislib_multiview_tripleView_3.ts]]
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
        Data:<em> Tilezen/Omv</em><br/> Theme: <em>Day</em>
    </div>
    <div class="themeName" id="mapTheme2">
        Data:<em> Tilezen/Omv</em><br/> Theme: <em>Reduced Night</em>
    </div>
    <div class="themeName" id="mapTheme3">
        Data:<em> Tilezen/Omv</em><br/> Theme: <em>Reduced Day</em>
    </div>
</div>
`;

    const defaultTheme = "./resources/reducedDay.json";
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

        const sampleMapView = new MapView({
            canvas,
            theme: theme !== undefined ? theme : defaultTheme,
            decoderUrl
        });
        sampleMapView.camera.position.set(0, 0, 800);

        // instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(sampleMapView);

        //Set the cameras height according to the given zoom level.
        sampleMapView.camera.position.setZ(
            MapViewUtils.calculateDistanceToGroundFromZoomLevel(sampleMapView, defaultZoomLevel)
        );

        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        setupSyncViewsGrid(sampleMapView, gridPositionX, gridPositionY);
        // react on resize events
        window.addEventListener("resize", () => {
            setupSyncViewsGrid(sampleMapView, gridPositionX, gridPositionY);
        });

        return { mapView: sampleMapView, mapControls };
    }

    // create `${numberOfSyncXViews}` MapViews, each with their own theme file
    // snippet:vislib_multiview_tripleView_1.ts
    const mapViews = {
        view1: initMapView("mapCanvas", 0, 0, "./resources/day.json", "./decoder.bundle.js"),
        view2: initMapView(
            "mapCanvas2",
            1,
            0,
            "./resources/reducedNight.json",
            "./decoder.bundle.js"
        ),
        view3: initMapView(
            "mapCanvas3",
            2,
            0,
            "./resources/reducedDay.json",
            "./decoder.bundle.js"
        )
    };
    // end:vislib_multiview_tripleView_1.ts

    // snippet:vislib_multiview_tripleView_2.ts
    const xyzDataSourceParams = {
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    };
    const dataSources = {
        omvDataSource1: new OmvDataSource(xyzDataSourceParams),
        omvDataSource2: new OmvDataSource(xyzDataSourceParams),
        omvDataSource3: new OmvDataSource(xyzDataSourceParams)
    };

    mapViews.view1.mapView.addDataSource(dataSources.omvDataSource1);
    mapViews.view2.mapView.addDataSource(dataSources.omvDataSource2);
    mapViews.view3.mapView.addDataSource(dataSources.omvDataSource3);
    // end:vislib_multiview_tripleView_2.ts

    /**
     * A function that copies the position and orientation of one MapView/MapControl to the others.
     *
     * @param srcView Source with MapView with current location and MapControl with current camera
     *                  position and orientation
     * @param destView Destination MapView synced to current location; MapControl synced to current
     *                  position and orientation
     */
    // snippet:vislib_multiview_tripleView_3.ts
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
    // end:vislib_multiview_tripleView_3.ts
}
