/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Map } from "@here/harp-map";
import { CopyrightInfo } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

export namespace Hello2WorldExample {
    const hereCopyrightInfo: CopyrightInfo = {
        id: "here.com",
        year: new Date().getFullYear(),
        label: "HERE",
        link: "https://legal.here.com/terms"
    };

    const map = new Map(document.body, {
        themeUrl: "resources/berlin_tilezen_base.json",
        location: [40.6935, -74.009],
        zoomLevel: 16.9,
        cameraYaw: 6.3,
        cameraPitch: 50,
        dataSources: [
            new OmvDataSource({
                baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
                apiFormat: APIFormat.XYZOMV,
                styleSetName: "tilezen",
                maxZoomLevel: 17,
                authenticationCode: accessToken,
                copyrightInfo: [hereCopyrightInfo]
            })
        ]
    });

    const infoElement = document.createElement("div");
    infoElement.style.position = "absolute";
    infoElement.style.right = "0";
    infoElement.style.top = "0";
    infoElement.style.backgroundColor = "#f0fef1";
    infoElement.style.zIndex = "400";
    infoElement.style.padding = "2px";
    infoElement.style.fontSize = "0.8em";
    infoElement.style.fontFamily = "sans-serif";
    document.body.appendChild(infoElement);

    function humanReadable(n: number) {
        return n.toPrecision(5).replace(/(\.)?0+$/, '');
    }
    map.addEventListener('camera-updated', () => {
        const location = map.geoCenter;
        infoElement.innerHTML = `
            Lat: ${humanReadable(location.latitude)}<br>
            Long: ${humanReadable(location.longitude)}<br>
            Zoom: ${humanReadable(map.mapView.zoomLevel)}
        `;
    });
}
