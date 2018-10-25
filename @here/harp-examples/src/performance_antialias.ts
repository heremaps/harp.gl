/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { MapView, MapViewEventNames, MSAASampling } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
// tslint:disable-next-line:no-var-requires
const Stats = require("stats.js");
import { GUI, GUIController } from "dat.gui";

/**
 * An example illustrating the performance of different antialiasing techniques:
 * - the native WebGL MSAA, with a default of four samples per frame,
 * - the internal MapView MSAA, with a customizable number of samples per frame.
 *
 * A first canvas is provided for all examples with the id `mapCanvas`. But two canvases are
 * required,because the native WebGL MSAA can only be specified when creating a WebGL context, and
 * it cannot be toggled at runtime. The internal MapView MSAA on the other hand does not necessarily
 * need the WebGL MSAA on top of itself. To satisfy these requirements, this example adds a second
 * canvas in the HTML that will handle the WebGL native MSAA display, with the id
 * `mapCanvas-antialiased`. With this setup, the native WebGL MSAA can then be toggled by only
 * displaying and rendering in one canvas at a time. The views will need to be synchronized when
 * toggling them so we can compare the render results.
 *
 * First the script initializes the two [[MapView]] instances with their associated [[MapControls]]
 * instances.
 * ```typescript
 * [[include:vislib_performance_antialias_1.ts]]
 * ```
 *
 * It further adds a dat.GUI user interface, allowing tinkering with the antialias settings.
 * ```typescript
 * [[include:vislib_performance_antialias_2.ts]]
 * ```
 *
 * Finally the Stats widget is added to the page to monitor the impact of the antialias settings.
 * ```typescript
 * [[include:vislib_performance_antialias_3.ts]]
 * ```
 */

export namespace AntialiasExample {
    // 1. Inject HTML code into the page to add a second canvas and position it.
    document.body.innerHTML += `
<style>
    #mapCanvas-antialiased, #mapCanvas {
        position: absolute;
        left: 0;
        width: 100%;
        height: 100%;
        top: 0;
        overflow: hidden;
        z-index: -1;
    }

    #stats {
        position: absolute;
        cursor: pointer;
    }

    #stats.info-minimized{
        bottom: 5px;
    }
</style>
<canvas id="mapCanvas-antialiased"></canvas>
`;

    // 2. Create 2 [[MapView]] instances, each with its own antialiasing parameters.
    const omvSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
        apiFormat: APIFormat.MapzenV2,
        styleSetName: "tilezen",
        maxZoomLevel: 17
    });
    const defaultTheme = "./resources/day.json";
    // snippet:vislib_performance_antialias_1.ts
    const viewWithNativeAntialiasing = initializeMapView(
        "mapCanvas-antialiased",
        defaultTheme,
        "./decoder.bundle.js",
        omvSource
    );
    const viewWithoutNativeAntialising = initializeMapView(
        "mapCanvas",
        defaultTheme,
        "./decoder.bundle.js",
        omvSource
    );
    viewWithNativeAntialiasing.mapView.canvas.style.display = "none";
    viewWithNativeAntialiasing.mapView.endAnimation();
    viewWithoutNativeAntialising.mapView.beginAnimation();
    // end:vislib_performance_antialias_1.ts

    // 3. Create the GUI to allow fiddling with the antialiasing settings.
    // snippet:vislib_performance_antialias_2.ts
    createUIForAntialiasingSettings(viewWithNativeAntialiasing, viewWithoutNativeAntialising);
    // end:vislib_performance_antialias_2.ts

    // 4. Add stats widget to observe the impact of the antialiasing settings.
    // snippet:vislib_performance_antialias_3.ts
    const stats = new Stats();
    stats.domElement.id = "stats";
    document.body.appendChild(stats.domElement);
    viewWithNativeAntialiasing.mapView.addEventListener(MapViewEventNames.Render, stats.begin);
    viewWithoutNativeAntialising.mapView.addEventListener(MapViewEventNames.Render, stats.begin);
    viewWithNativeAntialiasing.mapView.addEventListener(MapViewEventNames.AfterRender, stats.end);
    viewWithoutNativeAntialising.mapView.addEventListener(MapViewEventNames.AfterRender, stats.end);
    // end:vislib_performance_antialias_3.ts

    /**
     * A pair of [[MapView]] and [[MapControls]] instances, simplifying the synchronization of the
     * different views when toggling the canvas between the native-antialias-enabled one and the
     * other.
     */
    interface ViewControlPair {
        /**
         * A [[MapView]] instance.
         */
        mapView: MapView;

        /**
         * A [[MapControls]] instance.
         */
        mapControls: MapControls;
    }

    /**
     * Creates the pair of [[MapView]] and [[MapControls]]. This function enables the native WebGL
     * MSAA x4 if the string `antialiased` is included in the id of the canvas mentionned in its
     * first argument.
     *
     * @param id The ID of the HTML canvas element. Include the string `antialiased` in the
     * canvas'id to enable the native WebGL MSAA with this function.
     * @param theme The URL of the theme to load.
     * @param decoderUrl The URL of the decoder bundle.
     */
    export function initializeMapView(
        id: string,
        theme: string,
        decoderUrl: string,
        omvDataSource: OmvDataSource
    ): ViewControlPair {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            enableNativeWebglAntialias: id.includes("antialiased"),
            enableStatistics: true,
            theme: theme !== undefined ? theme : defaultTheme,
            decoderUrl
        });

        // Add Omv data source.
        mapView.addDataSource(omvDataSource);

        // Position the camera over the map.
        mapView.camera.position.set(0, 0, 800);
        // Center the camera on Berlin.
        mapView.geoCenter = new GeoCoordinates(52.518611, 13.376111, 0);

        // Instantiate the default map controls.
        const mapControls = new MapControls(mapView);

        // Resize the mapView to fill the page (an iframe in this case).
        mapView.resize(window.innerWidth, window.innerHeight);

        // React to resize events.
        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return { mapView, mapControls };
    }

    /**
     * Builds a dat.GUI user interface for testing antialising settings on the page.
     *
     * @param viewWithNativeAA A [[MapView]] instance initialized with the native WebGL antialising.
     * @param viewWithoutNativeAA A [[MapView]] instance initialized without the native WebGL
     * antialising.
     */

    export function createUIForAntialiasingSettings(
        viewWithNativeAA: ViewControlPair,
        viewWithoutNativeAA: ViewControlPair
    ) {
        const gui = new GUI({ width: 300 });

        const options = {
            nativeAA: {
                enabled: false,
                option: undefined as undefined | GUIController
            },
            msaa: {
                enabled: false,
                samplingLevel: MSAASampling.Level_1,
                option: undefined as undefined | GUIController
            }
        };

        const nativeAAGUIOption = gui.add(options.nativeAA, "enabled");
        options.nativeAA.option = nativeAAGUIOption;
        nativeAAGUIOption.name("Native WebGL MSAA (4samples)");
        nativeAAGUIOption.onChange((nativeAAEnabled: boolean) => {
            viewWithNativeAA.mapView.canvas.style.display = nativeAAEnabled ? "" : "none";
            viewWithoutNativeAA.mapView.canvas.style.display = nativeAAEnabled ? "none" : "";
            if (nativeAAEnabled) {
                synchronizeMapViews(viewWithoutNativeAA, viewWithNativeAA);
                viewWithNativeAA.mapView.beginAnimation();
                viewWithoutNativeAA.mapView.endAnimation();
            } else {
                synchronizeMapViews(viewWithNativeAA, viewWithoutNativeAA);
                viewWithNativeAA.mapView.endAnimation();
                viewWithoutNativeAA.mapView.beginAnimation();
            }
        });

        const customAAs = gui.addFolder("MapView's custom MSAA");

        const msaaOption = customAAs.add(options.msaa, "enabled");
        options.msaa.option = msaaOption;
        msaaOption.name("Enable");
        msaaOption.onChange((msaaEnabled: boolean) => {
            viewWithoutNativeAA.mapView.mapRenderingManager.msaaEnabled = msaaEnabled;
            viewWithNativeAA.mapView.mapRenderingManager.msaaEnabled = msaaEnabled;
        });

        const msaaLevelOption = customAAs.add(options.msaa, "samplingLevel", {
            "Level 0: 1 Sample": MSAASampling.Level_0,
            "Level 1: 2 Samples": MSAASampling.Level_1,
            "Level 2: 4 Samples": MSAASampling.Level_2,
            "Level 3: 8 Samples": MSAASampling.Level_3,
            "Level 4: 16 Samples": MSAASampling.Level_4,
            "Level 5: 32 Samples": MSAASampling.Level_5
        });
        msaaLevelOption.name("Sampling level");
        msaaLevelOption.onChange((samplingLevel: MSAASampling) => {
            // We only need to change the `dynamicMsaaSamplingLevel` as the rendering does not stop
            // in this example, because we want to monitor the impact of the MSAA sampling level on
            // the framerate over time.
            // tslint:disable-next-line:max-line-length
            viewWithoutNativeAA.mapView.mapRenderingManager.dynamicMsaaSamplingLevel = samplingLevel;
            viewWithNativeAA.mapView.mapRenderingManager.dynamicMsaaSamplingLevel = samplingLevel;
        });
    }

    /**
     * This function copies the position and orientation of a view to another through the provided
     * [[ViewControlPair]]s.
     *
     * @param srcView The source [[ViewControlPair]], with the camera projection to copy.
     * @param destView The destination [[ViewControlPair]], with the camera projection to
     * paste.
     */

    export function synchronizeMapViews(srcView: ViewControlPair, destView: ViewControlPair) {
        const ypr = srcView.mapControls.yawPitchRoll;
        destView.mapControls.setRotation(ypr.yaw, ypr.pitch);
        destView.mapControls.cameraHeight = srcView.mapControls.cameraHeight;
        destView.mapView.worldCenter.copy(srcView.mapView.worldCenter);
        destView.mapView.update();
    }
}
