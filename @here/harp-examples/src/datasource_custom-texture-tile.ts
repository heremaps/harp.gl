/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import {
    CopyrightElementHandler,
    CopyrightInfo,
    MapView,
    TextureLoader,
    Tile
} from "@here/harp-mapview";
import { WebTileDataSource } from "@here/harp-webtile-datasource";
import * as THREE from "three";

/**
 * A simple example using the webtile data source. Tiles are generated from a
 * texture
 *
 * A [[WebTileDataSource]] is created with specified getTexture function
 * ```typescript
 * [[include:harp_gl_datasource_webtile_1.ts]]
 * ```
 * Then added to the [[MapView]]
 * ```typescript
 * [[include:harp_gl_datasource_webtile_2.ts]]
 * ```
 */
export namespace CustomTextureTileDatasourceExample {
    // creates a new MapView for the HTMLCanvasElement of the given id
    export function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base_globe.json"
        });

        // instantiate the default map controls, allowing the user to pan around freely.
        const controls = new MapControls(map);

        // Add an UI.
        const ui = new MapControlsUI(controls, { zoomLevel: "input", projectionSwitch: true });
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

    // snippet:harp_gl_datasource_webtile_1.ts
    function getTexture(tile: Tile): Promise<[THREE.Texture, CopyrightInfo[]]> {
        return Promise.all([new TextureLoader().load("resources/wests_textures/clover.png"), []]);
    }

    const webTileDataSource = new WebTileDataSource({
        dataProvider: {
            getTexture
        }
    });
    // end:harp_gl_datasource_webtile_1.ts

    // snippet:harp_gl_datasource_webtile_2.ts
    mapView.addDataSource(webTileDataSource);
    // end:harp_gl_datasource_webtile_2.ts
}
