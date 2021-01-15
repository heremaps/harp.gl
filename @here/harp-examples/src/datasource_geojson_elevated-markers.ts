/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates, TileKey } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { DataProvider } from "@here/harp-mapview-decoder";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

import { apikey, copyrightInfo } from "../config";

/**
 * This examples shows how to render elevated GeoJSON points as markers.
 */
export namespace ElevatedGeoJsonMarkersExample {
    // Implement a class extending [[DataProvider]] that will generate the GeoJSON features.
    class CustomGeoJsonDataProvider extends DataProvider {
        connect() {
            // Here you could connect to the service.
            return Promise.resolve();
        }

        ready() {
            // Return true if connect was successful.
            return true;
        }

        getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<{}> {
            // Return a GeoJSON FeatureCollection with features in the tile with given `tileKey`.
            return Promise.resolve({
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        id: 0,
                        properties: { text: "Fernsehturm" },
                        geometry: { type: "Point", coordinates: [13.4094, 52.52085, 245] }
                    }
                ]
            });
        }

        /** @override */ dispose() {
            // Nothing to be done here.
        }
    }

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const imageTexture = "custom-icon";
        const map = new MapView({
            canvas,
            theme: {
                extends: "resources/berlin_tilezen_base.json",
                styles: {
                    // Specify the styling for the markers.
                    geojson: [
                        {
                            when: ["==", ["geometry-type"], "Point"],
                            technique: "labeled-icon",
                            imageTexture,
                            text: ["get", "text"],
                            iconYOffset: 35,
                            size: 15,
                            priority: 1000
                        }
                    ]
                }
            },
            target: new GeoCoordinates(52.5237, 13.4089),
            zoomLevel: 17.4,
            tilt: 78
        });

        // Register the icon image referenced in the style.
        // tslint:disable-next-line:max-line-length
        const imageString =
            "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDIyLjEuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHdpZHRoPSI0OHB4IiBoZWlnaHQ9IjQ4cHgiIHZlcnNpb249IjEuMSIgaWQ9Imx1aS1pY29uLWRlc3RpbmF0aW9ucGluLW9uZGFyay1zb2xpZC1sYXJnZSIKCSB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDQ4IDQ4IgoJIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDQ4IDQ4IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPGc+Cgk8ZyBpZD0ibHVpLWljb24tZGVzdGluYXRpb25waW4tb25kYXJrLXNvbGlkLWxhcmdlLWJvdW5kaW5nLWJveCIgb3BhY2l0eT0iMCI+CgkJPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTQ3LDF2NDZIMVYxSDQ3IE00OCwwSDB2NDhoNDhWMEw0OCwweiIvPgoJPC9nPgoJPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiNmZmZmZmYiIGQ9Ik0yNCwyQzEzLjg3MDgsMiw1LjY2NjcsMTAuMTU4NCw1LjY2NjcsMjAuMjIzMwoJCWMwLDUuMDMyNSwyLjA1MzMsOS41ODg0LDUuMzcxNywxMi44ODgzTDI0LDQ2bDEyLjk2MTctMTIuODg4M2MzLjMxODMtMy4zLDUuMzcxNy03Ljg1NTgsNS4zNzE3LTEyLjg4ODMKCQlDNDIuMzMzMywxMC4xNTg0LDM0LjEyOTIsMiwyNCwyeiBNMjQsMjVjLTIuNzY1LDAtNS0yLjIzNS01LTVzMi4yMzUtNSw1LTVzNSwyLjIzNSw1LDVTMjYuNzY1LDI1LDI0LDI1eiIvPgo8L2c+Cjwvc3ZnPgo=";
        map.userImageCache.addImage(imageTexture, imageString);

        CopyrightElementHandler.install("copyrightNotice").attach(map);

        const controls = new MapControls(map);

        // Add an UI.
        const ui = new MapControlsUI(controls, { projectionSwitch: true, zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        // Create a [[VectorTileDataSource]] using the custom data provider and the name of the
        // style set for the markers.
        map.addDataSource(
            new VectorTileDataSource({
                dataProvider: new CustomGeoJsonDataProvider(),
                name: "geojson",
                styleSetName: "geojson"
            })
        );

        map.update();

        return map;
    }

    document.body.innerHTML += `
    <style>
        #mapCanvas {
          top: 0;
        }
    </style>
`;

    const mapView = initializeMapView("mapCanvas");

    const omvDataSource = new VectorTileDataSource({
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        maxDataLevel: 17,
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        },
        copyrightInfo
    });

    mapView.addDataSource(omvDataSource);
}
