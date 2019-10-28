/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import { CopyrightElementHandler, CopyrightInfo, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

import * as L from "leaflet";

export namespace GettingStartedLeafletExample {
    function main() {
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement | undefined;

        if (!canvas) {
            throw new Error("canvas element not found");
        }

        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json"
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

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

        const map = L.map(canvas);

        function adjustSize() {
            const { x, y } = map.getSize();
            mapView.resize(x, y);
        }

        function syncMap() {
            const center = map.getCenter();
            const zoom = map.getZoom();
            mapView.setCameraGeolocationAndZoom(GeoCoordinates.fromLatLng(center), zoom);
        }

        map.on("resize", adjustSize);
        map.on("viewreset", syncMap);
        map.on("move", syncMap);
        map.on("zoom", syncMap);

        map.setView([52.52, 13.405], 17);

        setTimeout(() => {
            map.flyTo([41.9028, 12.4964], undefined, {
                animate: true,
                duration: 25
            });
        }, 2000);
    }

    main();
}
