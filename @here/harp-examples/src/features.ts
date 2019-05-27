/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeaturesDataSource, MapViewPolygonFeature } from "@here/harp-features-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightInfo, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

/**
 * We first create a base map. Other examples comment on the steps involved:
 * ```typescript
 * [[include:harp_simple_features_example_0.ts]]
 * ```
 *
 * Then we create a [[MapViewFeature]] and add it to a [[FeaturesDataSource]] with a custom
 * [[StyleSet]].
 * ```typescript
 * [[include:harp_simple_features_example_1.ts]]
 * ```
 */
export namespace SimpleFeaturesExample {
    // snippet:harp_simple_features_example_0.ts
    const map = createBaseMap();
    // end:harp_simple_features_example_0.ts

    // snippet:harp_simple_features_example_1.ts
    // We need to replicate the first point in the last coordinate to close the polygon.
    const polygon = new MapViewPolygonFeature([[[10, 50], [10, 30], [5, 30], [5, 50], [10, 50]]]);
    const featuresDataSource = new FeaturesDataSource();
    map.addDataSource(featuresDataSource).then(() => {
        featuresDataSource.add(polygon).setStyleSet([
            {
                technique: "fill",
                when: "$geometryType == 'polygon'",
                renderOrder: 10000,
                attr: {
                    color: "#ff0000"
                }
            }
        ]);
    });
    // end:harp_simple_features_example_1.ts

    function createBaseMap(): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });
        mapView.setCameraGeolocationAndZoom(new GeoCoordinates(25, 13), 3.9);

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));

        const hereCopyrightInfo: CopyrightInfo = {
            id: "here.com",
            year: new Date().getFullYear(),
            label: "HERE",
            link: "https://legal.here.com/terms"
        };
        const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

        const baseMap = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo: copyrights
        });
        mapView.addDataSource(baseMap);

        return mapView;
    }

    function getExampleHTML() {
        return `
            <style>
                #mapCanvas {
                    top: 0;
                }
        `;
    }
}
