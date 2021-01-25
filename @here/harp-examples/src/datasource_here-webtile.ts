/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Theme } from "@here/harp-datasource-protocol";
import { ProjectionType } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { HereWebTileDataSource, WebTileDataSource } from "@here/harp-webtile-datasource";

import { apikey } from "../config";

const FLAT_THEME: Theme = {
    clearColor: "#f8fbfd"
};

const GLOBE_THEME: Theme = {
    clearColor: "#99ceff",
    sky: {
        type: "cubemap",
        positiveX: "./resources/Sky_px.png",
        negativeX: "./resources/Sky_nx.png",
        positiveY: "./resources/Sky_py.png",
        negativeY: "./resources/Sky_ny.png",
        positiveZ: "./resources/Sky_pz.png",
        negativeZ: "./resources/Sky_nz.png"
    },

    styles: {
        polar: [
            {
                description: "North pole",
                when: ["==", ["get", "kind"], "north_pole"],
                technique: "fill",
                renderOrder: 5,
                color: "#99ceff"
            },
            {
                description: "South pole",
                when: ["==", ["get", "kind"], "south_pole"],
                technique: "fill",
                renderOrder: 5,
                color: "#f5f8fa"
            }
        ]
    }
};

/**
 * A simple example using the herewebtile data source. Tiles are retrieved from
 * ```
 * https://1.base.maps.ls.hereapi.com/maptile/2.1/maptile/newest/normal.day/${level}/${column}/${row}/512/png8?apikey=${apikey}
 * ```
 *
 * A [[HereWebTileDataSource]] is created with specified applications' apikey passed
 * as [[WebTileDataSourceOptions]]
 * ```typescript
 * [[include:harp_gl_datasource_herewebtile_1.ts]]
 * ```
 * Then added to the [[MapView]]
 * ```typescript
 * [[include:harp_gl_datasource_herewebtile_2.ts]]
 * ```
 */
export namespace HereWebTileDataSourceExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const map = new MapView({
            canvas,
            theme: FLAT_THEME
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        const controls = new MapControls(map);

        // Add an UI.
        const ui = new MapControlsUI(controls, { zoomLevel: "input", projectionSwitch: true });
        ui.projectionSwitchElement?.addEventListener("click", async () => {
            await map.setTheme(
                map.projection.type === ProjectionType.Spherical ? GLOBE_THEME : FLAT_THEME
            );
        });
        canvas.parentElement!.appendChild(ui.domElement);

        CopyrightElementHandler.install("copyrightNotice", map);

        // resize the mapView to maximum
        map.resize(window.innerWidth, window.innerHeight);

        // react on resize events
        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        return map;
    }

    const mapView = initializeMapView("mapCanvas");

    // snippet:harp_gl_datasource_herewebtile_1.ts
    const hereWebTileDataSource = new HereWebTileDataSource({
        apikey,
        ppi: WebTileDataSource.ppiValue.ppi320
    });
    // end:harp_gl_datasource_herewebtile_1.ts

    // snippet:harp_gl_datasource_herewebtile_2.ts
    mapView.addDataSource(hereWebTileDataSource);
    // end:harp_gl_datasource_herewebtile_2.ts
}
