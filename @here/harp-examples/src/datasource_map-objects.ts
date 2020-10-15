/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { MapObjectsDataSource } from "@here/harp-vectortile-datasource/lib/MapObjectsDataSource";
import { randomPoint, randomPolygon } from "@turf/random";
import { geomEach } from "@turf/turf";

import { apikey } from "../config";

export namespace MapObjectsExamples {
    const mapObjectStyleSet: StyleSet = [
        {
            styleSet: "map-objects",
            when: ["==", ["geometry-type"], "Polygon"],
            technique: "fill",
            color: ["get", "color"],
            lineColor: "rgb(0,0,0)",
            lineWidth: 4,
            renderOrder: ["number", ["get", "sort-rank"], 100000],
            minZoomLevel: ["get", "minzoom"],
            maxZoomLevel: ["get", "maxzoom"]
        },
        {
            styleSet: "map-objects",
            when: ["==", ["geometry-type"], "Point"],
            technique: "circles",
            size: ["number", ["get", "size"], 10],
            color: ["get", "color"],
            renderOrder: ["number", ["get", "sort-rank"], 100000],
            minZoomLevel: ["get", "minzoom"],
            maxZoomLevel: ["get", "maxzoom"]
        }
    ];

    async function main(id: string = "mapCanvas") {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        const NY = new GeoCoordinates(40.707, -74.01);
        const map = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_base.json",
            target: NY,
            zoomLevel: 2
        });

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 50;

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input", projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        map.addDataSource(omvDataSource);

        const mapObjects = new MapObjectsDataSource();

        await map.addDataSource(mapObjects);
        await mapObjects.setTheme({ styles: mapObjectStyleSet });

        const polygons = randomPolygon(1000, {
            bbox: [-180 * 4, -85, 180 * 4, 85],
            max_radial_length: 7,
            num_vertices: 10
        });

        geomEach(polygons, geometry => {
            mapObjects.addPolygon({
                coordinates: geometry.coordinates as any,
                maxZoomLevel: 14
            });
        });

        const points = randomPoint(100, {});

        geomEach(points, geometry => {
            mapObjects.addMarker({
                coordinates: geometry.coordinates as any,
                color: "yellow",
                size: 15
            });
        });
    }

    // eslint-disable-next-line no-console
    main().catch(console.error);
}
