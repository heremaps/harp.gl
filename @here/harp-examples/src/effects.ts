/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    MapViewEventNames
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { GUI } from "dat.gui";
import { accessToken } from "../config";

/**
 * Harp's effects playground example with GUI to tweak values in one's own map. The effects are
 * adapted from ThreeJS's original effects. They can be tailored from [[MapView]]'s
 * [[MapRenderingManager]]:
 *
 * ```typescript
 * [[include:effects_example.ts]]
 * ```
 *
 * Note that [[Theme]]s also control effects, as visible in the hello example. So, to use the
 * rendering API directly, we need to apply them after the loading of the provided theme:
 * ```typescript
 * [[include:effects_example2.ts]]
 * ```
 */
export namespace EffectsExample {
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        mapView.setCameraGeolocationAndZoom(new GeoCoordinates(40.6861, -74.0072), 16.6);
        const mapControls = new MapControls(mapView);
        mapControls.maxPitchAngle = 60;
        mapControls.setRotation(6.3, 60);

        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return mapView;
    }

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
    map.addDataSource(omvDataSource);

    const options = {
        labels: false,
        toneMappingExposure: 1.0,
        outline: {
            enabled: true,
            ghostExtrudedPolygons: false,
            thickness: 0.004,
            color: "#898989"
        },
        bloom: {
            enabled: true,
            strength: 0.5,
            threshold: 0.83,
            radius: 1
        },
        vignette: {
            enabled: true,
            offset: 1.0,
            darkness: 1.0
        },
        sepia: {
            enabled: true,
            amount: 0.55
        }
    };

    const updateRendering = () => {
        // snippet:effects_example.ts
        map.renderLabels = options.labels;
        map.renderer.toneMappingExposure = options.toneMappingExposure;
        map.mapRenderingManager.outline.enabled = options.outline.enabled;
        map.mapRenderingManager.updateOutline(options.outline);
        map.mapRenderingManager.bloom = options.bloom;
        map.mapRenderingManager.vignette = options.vignette;
        map.mapRenderingManager.sepia = options.sepia;
        // end:effects_example.ts
        map.update();
    };

    // snippet:effects_example2.ts
    // Themes can use effects. So we need to wait for the theme provided to MapView to be loaded
    // first, and then apply the default effects we want to apply.
    map.addEventListener(MapViewEventNames.ThemeLoaded, updateRendering);
    // end:effects_example2.ts

    const gui = new GUI({ width: 300 });
    gui.add(options, "labels").onChange(updateRendering);
    gui.add(options, "toneMappingExposure", 0.0, 1.5).onChange(updateRendering);
    const outlineFolder = gui.addFolder("Outlines");
    outlineFolder.add(options.outline, "enabled").onChange(updateRendering);
    outlineFolder.add(options.outline, "thickness", 0.001, 0.03).onChange(updateRendering);
    outlineFolder.add(options.outline, "ghostExtrudedPolygons").onChange(updateRendering);
    outlineFolder.addColor(options.outline, "color").onChange(updateRendering);
    const bloomFolder = gui.addFolder("Bloom");
    bloomFolder.add(options.bloom, "enabled").onChange(updateRendering);
    bloomFolder.add(options.bloom, "strength", 0, 2.0).onChange(updateRendering);
    bloomFolder.add(options.bloom, "threshold", 0.0, 1.0).onChange(updateRendering);
    bloomFolder.add(options.bloom, "radius", 0.0, 1.0).onChange(updateRendering);
    const vignetteFolder = gui.addFolder("Vignette");
    vignetteFolder.add(options.vignette, "enabled").onChange(updateRendering);
    const vignetteOffset = vignetteFolder.add(options.vignette, "offset", 0, 2);
    vignetteOffset.onChange(updateRendering);
    vignetteFolder.add(options.vignette, "darkness", 0, 2).onChange(updateRendering);
    const sepiaFolder = gui.addFolder("Sepia");
    sepiaFolder.add(options.sepia, "enabled").onChange(updateRendering);
    sepiaFolder.add(options.sepia, "amount", 0, 1).onChange(updateRendering);
}
