/*
 * Copyright (C) 2017-2018 HERE Global B.V. and its affiliate(s).
 * All rights reserved.
 *
 * This software and other materials contain proprietary information
 * controlled by HERE and are protected by applicable copyright legislation.
 * Any use and utilization of this software and other materials and
 * disclosure to any third parties is conditional upon having a separate
 * agreement with HERE for the access, use, utilization or disclosure of this
 * software. In the absence of such agreement, the use of the software is not
 * allowed.
 */

import { GeoCoordinates } from "@here/geoutils";
import { LandmarkTileDataSource } from "@here/landmark-datasource";
import { MapControls } from "@here/map-controls";
import { MapView } from "@here/mapview";
import { OmvDataSource } from "@here/omv-datasource";
import { WebTileDataSource } from "@here/webtile-datasource";

import { appCode, appId, hrn } from "../config";

/**
 * A simple example showing two MapViews with different themes or even datasources.
 *
 * Create two views with their own MapView and a MaControl
 * as WebTileDataSourceOptions:
 * ```typescript
 * [[include:vislib_syncview_1.ts]]
 * ```
 *
 * After adding the two MapViews with their own datasources, add event handler to sync the two
 * MapViews:
 * ```typescript
 * [[include:vislib_syncview_2.ts]]
 * ```
 */

export namespace SyncViewExample {
    // inject HTML code to page to show second map cancas and position them
    document.body.innerHTML += `

<style>

    #mapCanvas {
        position: absolute;
        border: 0px;
        left: 0px;
        width: 100%;
        height: 50%;
        top: 0%;
        overflow: hidden;
        z-index: -1
    }
    #mapCanvas2 {
        position: absolute;
        border: 0px;
        left: 0px;
        width: 100%;
        height: 50%;
        top: 50%;
        overflow: hidden;
        z-index: -1
    }

</style>

<canvas id="mapCanvas2"></canvas>
`;

    const defaultTheme = "./resources/reducedDay.json";

    // if true, the lower MapView will show the WebTile datasource content
    const SHOW_WEBTILES = false;

    /**
     * A pair of MapView and MapController.
     */
    export interface ViewControlPair {
        mapView: MapView;
        mapControls: MapControls;
    }

    /**
     * Creates the pair of MapView and MapControllers required to sync the two views.
     *
     * @param id ID of HTML canvas element
     * @param theme URL of theme to load
     * @param decoderUrl URL of decoder bundle
     */
    export function initializeMapView(
        id: string,
        theme?: string,
        decoderUrl?: string
    ): ViewControlPair {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const sampleMapView = new MapView({
            canvas,
            theme: theme !== undefined ? theme : defaultTheme,
            decoderUrl
        });

        // let the camera float over the map, looking straight down
        sampleMapView.camera.position.set(0, 0, 800);
        // center the camera somewhere around Berlin geo locations
        sampleMapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // instantiate the default map controls, allowing the user to pan around freely.
        const mapControls = new MapControls(sampleMapView);

        // resize the mapView to maximum
        sampleMapView.resize(window.innerWidth, window.innerHeight / 2);

        // react on resize events
        window.addEventListener("resize", () => {
            sampleMapView.resize(window.innerWidth, window.innerHeight / 2);
        });

        return { mapView: sampleMapView, mapControls };
    }

    // create two MapViews, each with their own theme file
    // snippet:vislib_syncview_1.ts
    const view1 = initializeMapView("mapCanvas", "./resources/theme.json", "./decoder.bundle.js");
    const view2 = initializeMapView(
        "mapCanvas2",
        "./resources/reducedDay.json",
        "./decoder.bundle.js"
    );
    // end:vislib_syncview_1.ts

    const omvDataSource = new OmvDataSource({
        hrn,
        appId,
        appCode
    });

    const landmarkTileDataSource = new LandmarkTileDataSource({
        hrn,
        appId,
        appCode
    });

    view1.mapView.addDataSource(omvDataSource);
    view1.mapView.addDataSource(landmarkTileDataSource);

    if (SHOW_WEBTILES) {
        const webTileDataSource = new WebTileDataSource({
            appId,
            appCode
        });

        view2.mapView.addDataSource(webTileDataSource);
    } else {
        const omvDataSource2 = new OmvDataSource({
            hrn,
            appId,
            appCode
        });

        const landmarkTileDataSource2 = new LandmarkTileDataSource({
            hrn,
            appId,
            appCode
        });

        view2.mapView.addDataSource(omvDataSource2);
        view2.mapView.addDataSource(landmarkTileDataSource2);
    }

    /**
     * A function that copies the position and orientation of one MapView/MapControl
     * @param srcView Source with MapView with current location and MapControl with current camera
     *                  position and orientation
     * @param destView Destination MapView synced to current location; MapControl synced to current
     *                  position and orientation
     */
    // snippet:vislib_syncview_2.ts
    export const syncMapViews = (srcView: ViewControlPair, destView: ViewControlPair) => {
        const ypr = srcView.mapControls.yawPitchRoll;
        destView.mapControls.setRotation(ypr.yaw, ypr.pitch);

        destView.mapView.worldCenter.copy(srcView.mapView.worldCenter);

        destView.mapControls.cameraHeight = srcView.mapControls.cameraHeight;

        // force update on changed MapView
        destView.mapView.update();
    };

    // sync camera of view2 if view1 changes.
    view1.mapControls.addEventListener(
        "update",
        (): void => {
            syncMapViews(view1, view2);
        }
    );

    // sync camera of view1 if view2 changes.
    view2.mapControls.addEventListener(
        "update",
        (): void => {
            syncMapViews(view2, view1);
        }
    );
    // end:vislib_syncview_2.ts
}
