/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextureCoordinateType, Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, CopyrightInfo, MapView, ThemeLoader } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

export namespace HelloWorldTexturedExample {
    function main() {
        addTextureCoypright();

        const mapView = initializeMapView("mapCanvas");

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

        mapView.addDataSource(omvDataSource);
    }

    function addTextureCoypright() {
        document.body.innerHTML += `
<style>
    #mapCanvas {
        top: 0;
    }
    #texture-license{
        margin: 10px;
        padding: 10px;
        color: #cccccc;
    }
</style>
<p id="texture-license">Textures by
<a href="https://opengameart.org/content/wall-grass-rock-stone-wood-and-dirt-480">
West</a>.</p>`;
    }

    /**
     * Modify the theme after loading and replace some area features that use the [[FillTechnique]]
     * to use [[StandardTexturedTechnique]] instead.
     * This enables lighting for these areas and allows to specify textures.
     * This could solely be done in the theme json file but for explanatory reasons it's done here.
     * @param theme The theme that should be modified.
     * @returns The modified theme.
     */
    function modifyTheme(theme: Theme): Theme {
        const urbanAreaTexture = "resources/wests_textures/paving.png";
        const parkTexture = "resources/wests_textures/clover.png";

        if (theme.styles) {
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                const styleSet = theme.styles[styleSetName];
                styleSet.forEach(style => {
                    if (style.description === "urban area") {
                        style.technique = "standard";
                        style.attr = {
                            color: "#ffffff",
                            map: urbanAreaTexture,
                            mapProperties: {
                                repeatU: 10,
                                repeatV: 10,
                                wrapS: "repeat",
                                wrapT: "repeat"
                            },
                            textureCoordinateType: TextureCoordinateType.TileSpace
                        };
                    } else if (style.description === "park") {
                        style.technique = "standard";
                        style.attr = {
                            color: "#ffffff",
                            map: parkTexture,
                            mapProperties: {
                                repeatU: 5,
                                repeatV: 5,
                                wrapS: "repeat",
                                wrapT: "repeat"
                            },
                            textureCoordinateType: TextureCoordinateType.TileSpace
                        };
                    } else if (style.description === "building_geometry") {
                        // Disable extruded buildings to reduce noise.
                        style.technique = "none";
                    }
                });
            }
        }
        return theme;
    }

    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const themePromise: Promise<Theme> = ThemeLoader.loadAsync(
            "resources/berlin_tilezen_base.json"
        );
        const map = new MapView({
            canvas,
            theme: themePromise.then(modifyTheme)
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        map.camera.position.set(0, 0, 1600);

        map.geoCenter = new GeoCoordinates(40.7, -74.010241978);
        const mapControls = new MapControls(map);
        mapControls.setRotation(0.9, 23.928);
        const ui = new MapControlsUI(mapControls);
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        return map;
    }

    main();
}
