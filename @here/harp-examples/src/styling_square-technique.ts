/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { apikey } from "../config";

/**
 * A small example using the {@links SquaresTechnique} to add a pink suqare to
 * each place in the map.
 *
 * The {@links MapView} will be initialized with a theme that extends the
 * default theme with a style that overrides the places with a square
 * ```typescript
 * [[include:squares_technique_example.ts]]
 * ```
 */

const squareTheme: Theme = {
    styles: {
        tilezen: [
            {
                layer: "places",
                technique: "squares",
                when: ["==", ["geometry-type"], "Point"],
                color: "#ff00ff",
                metricUnit: "Meter",
                size: 50
            }
        ]
    }
};

const circleTheme: Theme = {
    styles: {
        tilezen: [
            {
                layer: "places",
                technique: "circles",
                when: ["==", ["geometry-type"], "Point"],
                color: "#ff00ff",
                metricUnit: "Meter",
                size: 50
            }
        ]
    }
};

export namespace SquaresTechniqueExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        // Look at New York.
        const NY = new GeoCoordinates(40.707, -74.01);
        const map = new MapView({
            canvas,
            // snippet:squares_technique_example.ts
            theme: "resources/berlin_tilezen_base.json",
            // end:squares_technique_example.ts
            target: NY,
            tilt: 50,
            heading: -20,
            zoomLevel: 15.1
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addVectorTileDataSource(map);

        return map;
    }

    function addVectorTileDataSource(map: MapView) {
        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        map.addDataSource(omvDataSource);

        const points = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey,
            dataSourceOrder: 1,
            addGroundPlane: false
        });
        map.addDataSource(points);
        let theme = 0;
        const changeTheme = () => {
            if (theme++ % 2 === 0) {
                points.setTheme(circleTheme);
            } else {
                points.setTheme(squareTheme);
            }
            map.update();
            setTimeout(changeTheme, 2000);
        };
        setTimeout(changeTheme, 1000);

        return map;
    }

    export const mapView = initializeMapView("mapCanvas");
}
