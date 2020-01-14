/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinates } from "@here/harp-geoutils";
import {
    MapView,
    MapViewEventNames,
    MapViewOptions,
    PerformanceStatistics
} from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";

import { accessToken } from "../../@here/harp-examples/config";

// tslint:disable-next-line:no-var-requires
const theme = require("../resources/theme.json");

const performanceTest = false;

export function createMap(options: MapViewOptions) {
    const map = new MapView({
        ...options,
        decoderUrl: "decoder.main.js",
        theme,
        preserveDrawingBuffer: true,
        maxVisibleDataSourceTiles: 40,
        tileCacheSize: 100,
        enableStatistics: (performanceTest as boolean) === true
    });

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        authenticationCode: accessToken
    });
    map.addDataSource(omvDataSource);

    const lookAtOptions = { tilt: 34.3, distance: 1400 };
    const Boston = new GeoCoordinates(42.361145, -71.057083);
    let azimuth = 135;
    map.lookAt(Boston, lookAtOptions.distance, lookAtOptions.tilt, azimuth);

    map.addEventListener(MapViewEventNames.FrameComplete, () => {
        // tslint:disable-next-line:no-console
        console.log("#FirstFrameComplete, starting animation");

        let animationEnabled = true;
        map.addEventListener(MapViewEventNames.Render, () => {
            if (animationEnabled) {
                map.lookAt(Boston, lookAtOptions.distance, lookAtOptions.tilt, (azimuth += 0.1));
            }
        });

        setTimeout(() => {
            map.beginAnimation();
            if (performanceTest) {
                setTimeout(() => {
                    animationEnabled = false;
                    map.endAnimation();

                    PerformanceStatistics.instance.log("after 10 seconds");
                }, 10000);
            }
        }, 0.5);
    });

    return map;
}
