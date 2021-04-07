/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView, MapViewEventNames, MapViewUtils } from "@here/harp-mapview";
import {
    APIFormat,
    AuthenticationMethod,
    VectorTileDataSource
} from "@here/harp-vectortile-datasource";

import { apikey, copyrightInfo } from "../../@here/harp-examples/config";

const theme = require("../resources/theme.json");

import "../css/index.css";

const s3Base = "https://www.harp.gl/docs/";

//Update initial links to s3 base
document.querySelector<HTMLAnchorElement>(".examples-link")!.href = s3Base + "master/examples/";
document.querySelector<HTMLAnchorElement>(".docs-link")!.href = s3Base + "master/doc/";
document.querySelector<HTMLAnchorElement>("#docs-nav")!.href = s3Base + "master/doc/";
document.querySelector<HTMLAnchorElement>("#examples-nav")!.href = s3Base + "master/examples/";
document.querySelector<HTMLAnchorElement>("#docs-nav-mobile")!.href = s3Base + "master/doc/";

//Update year
(document.getElementById("year") as HTMLDivElement).innerText = `${new Date().getFullYear()}`;

const releases = [
    {
        date: "latest",
        hash: "master",
        version: "latest-dev"
    }
];
const dropdown = document.querySelector("select[name=versions]") as HTMLSelectElement;

fetch("./releases.json")
    .then(res => res.json())
    .then(res => {
        releases.push(...res);
        releases.forEach(release => {
            const option = document.createElement("option");
            option.innerText = release.version;
            dropdown.appendChild(option);
        });

        dropdown.onchange = () => {
            const selected = dropdown.querySelector<HTMLOptionElement>("option:checked")!;
            const release = releases.find(x => x.version === selected.innerText);
            if (!release) {
                return;
            }
            const hash = release.hash;
            const version = release.version;

            //Update examples button and link
            document.querySelector<HTMLAnchorElement>(".examples-link")!.href =
                s3Base + hash + "/examples/";
            document.querySelector<HTMLAnchorElement>(".examples-link")!.innerText =
                "Examples" + (hash !== "master" ? ` (${version})` : "");

            //Update docs button and link
            document.querySelector<HTMLAnchorElement>(".docs-link")!.href = s3Base + hash + "/doc/";
            document.querySelector<HTMLAnchorElement>(".docs-link")!.innerText =
                "Documentation" + (hash !== "master" ? ` (${version})` : "");
        };
    })
    .catch(() => {
        //In case network request to build information fails, add master link
        const option = document.createElement("option");
        option.innerText = "master";
        dropdown.appendChild(option);
    });

function main() {
    const canvas = document.getElementById("map") as HTMLCanvasElement;
    const map = new MapView({
        canvas,
        decoderUrl: "decoder.bundle.js",
        theme: (theme as unknown) as Theme,
        maxVisibleDataSourceTiles: 40,
        enableMixedLod: false,
        tileCacheSize: 100
    });
    map.animatedExtrusionHandler.enabled = false;

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

    map.resize(window.innerWidth, 500);
    window.addEventListener("resize", () => map.resize(window.innerWidth, 500));

    const zoomLevel = MapViewUtils.calculateZoomLevelFromDistance(map, 1400);
    const Boston = new GeoCoordinates(42.361145, -71.057083);
    const options = { target: Boston, zoomLevel, tilt: 34.3, heading: 135 };
    map.lookAt(options);

    const onFrameComplete = () => {
        // FrameComplete is fired multiple times (each time the camera changes and the tiles are
        // loaded), hence we just set the Render event listener once below.
        map.removeEventListener(MapViewEventNames.FrameComplete, onFrameComplete);
        canvas.style.opacity = "1";

        map.addEventListener(MapViewEventNames.Render, () =>
            map.lookAt({ heading: map.heading + 0.1 })
        );
        setTimeout(() => {
            map.beginAnimation();
        }, 0.5);
    };
    map.addEventListener(MapViewEventNames.FrameComplete, onFrameComplete);
}

main();
