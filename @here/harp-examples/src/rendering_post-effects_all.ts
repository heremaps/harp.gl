/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";
import { GUI } from "dat.gui";

import { apikey, copyrightInfo } from "../config";

/**
 * Harp's effects playground example with GUI to tweak values in one's own map. The effects are
 * adapted from ThreeJS's original effects. They can be tailored from [[MapView]]'s
 * [[MapRenderingManager]]:
 *
 * ```typescript
 * [[include:effects_example.ts]]
 * ```
 *
 * Note that a [[PostEffect]] configuration file can also be written and loaded with a [[Theme]], as
 * visible in the `effects_all` example.
 * ```typescript
 * [[include:effects_example2.ts]]
 * ```
 */
export namespace EffectsAllExample {
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const mapControls = new MapControls(mapView);
        mapControls.maxTiltAngle = 60;
        const singapour = new GeoCoordinates(1.2893999, 103.8537169);
        mapView.lookAt({ target: singapour, zoomLevel: 16.1, tilt: 60, heading: 240 });
        mapView.zoomLevel = 16.1;

        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        return mapView;
    }

    const map = initializeMapView("mapCanvas");

    const omvDataSource = new VectorTileDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        },
        copyrightInfo
    });
    map.addDataSource(omvDataSource);

    const options = {
        labels: false,
        toneMappingExposure: 1.0,
        outline: {
            enabled: false,
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

    updateRendering();

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
