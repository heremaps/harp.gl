/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

/**
 * This examples demonstrates how to insert custom features in MapView. This current stage is only
 * a proof-of-concept of how it should work under the hood and should implement the custom features
 * API in the next iteration.
 */
export namespace CustomFeaturesExample {
    const map = createBaseMap();

    // This is the first argument that a `createPolygon` method should take in.
    const polygonPath = [
        [7.1630859, 50.2893393],
        [4.4824219, 49.4109732],
        [5.4492188, 47.754098],
        [7.4267578, 48.2539411]
    ];
    // Internally `createPolygon` should then generate this style. A default style should exist.
    const polygonStyle = {
        when: "$geometryType == 'polygon'",
        technique: "fill",
        renderOrder: 2000,
        attr: {
            color: "#ff0000"
        }
    };

    // This should be held privately in MapView and updated everytime `addFeature` or
    // `removeFeature` is called.
    const m_userGeoJson = {
        type: "FeatureCollection",
        features: [
            // The feature's geometry should be created in MapView, in `addFeature`.
            {
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: [polygonPath]
                }
            }
        ]
    };
    const meta = document.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = "default-src * 'unsafe-inline' ;object-src 'self' blob:";
    document.getElementsByTagName("head")[0].appendChild(meta);
    // Then when the user Geojson is changed, a URL is generated to read it, because that is how the
    // GeoJsonDataProvider currently retrieves data that it can tile on-the-fly.
    const m_userGeoJsonBlob = new Blob([JSON.stringify(m_userGeoJson)], {
        type: "application/json"
    });
    const m_userDataURL = URL.createObjectURL(m_userGeoJsonBlob);

    // This should only happen the first time `addFeature` is called on MapView.
    const url = new URL(m_userDataURL, window.location.href);
    const m_userFeaturesDataSource = new OmvDataSource({
        name: "user",
        styleSetName: "user",
        dataProvider: new GeoJsonDataProvider("user", url)
    });
    map.addDataSource(m_userFeaturesDataSource)
        // `setStyleSet` allows to apply a local set of styles onto the custom features data source,
        // whatever the theme.
        .then(() => m_userFeaturesDataSource.setStyleSet([polygonStyle]));

    function createBaseMap(): MapView {
        document.body.innerHTML += `
            <style>
                #mapCanvas {
                top: 0;
                }
            </style>
        `;
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({ canvas, theme: "resources/olp_tilezen_night_reduced.json" });
        window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));
        mapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        mapView.geoCenter = new GeoCoordinates(16, -4, 0);

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        const baseMap = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/512/all",
            apiFormat: APIFormat.XYZMVT,
            styleSetName: "here_olp",
            maxZoomLevel: 17,
            authenticationCode: accessToken
        });
        mapView.addDataSource(baseMap);

        CopyrightElementHandler.install("copyrightNotice")
            .attach(mapView)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        return mapView;
    }
}
