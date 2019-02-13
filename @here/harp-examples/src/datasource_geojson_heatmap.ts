/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet } from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import * as THREE from "three";

/**
 * This example demonstrates how to generate a heatmap-like [[StyleSet]] for a GeoJson. To do so,
 * each [[Style]] needs to define its own color shade, and they all need to be staggered on a
 * specific range of values. Here, the values are brought directly in the data of the GeoJson,
 * through the properties held in each feature. This GeoJson is a map of Italy, each feature
 * represents a region, and the properties bear the population density of that region. We can
 * narrow the `when` [[Expr]] condition of a [[Style]] to a value in a property, by simply writing
 * `propertyName` in the condition. The algorithm then reads:
 * ```typescript
 * [[include:geojson_heatmap1.ts]]
 * ```
 *
 * The algorithm loops through a range of values to create the [[Style]]s based on a range of
 * values, hence the variables in use. Externally it is wrapped in a more readable function where we
 * can simply describe the heatmap desired:
 * ```typescript
 * [[include:geojson_heatmap2.ts]]
 * ```
 *
 * Finally this [[StyleSet]] is assigned to the [[DataSource]]:
 * ```typescript
 * [[include:geojson_heatmap3.ts]]
 * ```
 */
export namespace GeoJsonHeatmapExample {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
        </style>
    `;

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeBaseMap(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme: "resources/reducedNight.json"
        });

        CopyrightElementHandler.install("copyrightNotice")
            .attach(mapView)
            .setDefaults([
                {
                    id: "openstreetmap.org",
                    label: "OpenStreetMap contributors",
                    link: "https://www.openstreetmap.org/copyright"
                }
            ]);

        mapView.camera.position.set(2000000, 3500000, 6000000); // Europe.
        mapView.geoCenter = new GeoCoordinates(16, -4, 0);

        MapControls.create(mapView);
        mapView.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        const baseMapDataSource = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/osmbase/256/all",
            apiFormat: APIFormat.MapzenV2,
            styleSetName: "tilezen",
            maxZoomLevel: 17
        });

        mapView.addDataSource(baseMapDataSource);

        return mapView;
    }

    // snippet:geojson_heatmap2.ts
    const densityStyleSet: StyleSet = generateHeatStyleSet({
        property: "density",
        thresholds: [50, 100, 150, 200, 250, 300, 350, 400, 450],
        color: "#ff6600"
    });
    // end:geojson_heatmap2.ts

    /**
     * A generator for a heatmap-like [[StyleSet]].
     *
     * @param options Heatmap settings.
     */
    function generateHeatStyleSet(options: {
        thresholds: number[];
        color: string;
        property: string;
    }): StyleSet {
        const styleSet: StyleSet = [];
        const length = options.thresholds.length;
        for (let i = 0; i < length; i++) {
            const color = new THREE.Color(options.color);
            color.multiplyScalar((i + 1) / 2 / length + 0.5);
            const max = options.thresholds[i];
            const min = i - 1 < 0 ? 0 : options.thresholds[i - 1];
            // snippet:geojson_heatmap1.ts
            const propertyName = options.property;
            const style = {
                description: "geoJson property-based style",
                when:
                    `$geometryType == 'polygon'` +
                    `&& ${propertyName} > ${min}` +
                    `&& ${propertyName} <= ${max}`,
                renderOrder: 1000,
                technique: "extruded-polygon",
                attr: {
                    color: "#" + color.getHexString(),
                    transparent: true,
                    opacity: 0.8,
                    lineWidth: 1.0
                }
            };
            // end:geojson_heatmap1.ts
            styleSet.push(style);
        }
        return styleSet;
    }

    const baseMap = initializeBaseMap("mapCanvas");

    const geoJsonDataProvider = new GeoJsonDataProvider(
        "italy",
        new URL("resources/italy.json", window.location.href)
    );
    const geoJsonDataSource = new OmvDataSource({
        dataProvider: geoJsonDataProvider,
        name: "geojson",
        styleSetName: "geojson"
    });
    baseMap.addDataSource(geoJsonDataSource).then(() => {
        // snippet:geojson_heatmap3.ts
        geoJsonDataSource.setStyleSet(densityStyleSet);
        // end:geojson_heatmap3.ts
    });

    baseMap.update();
}
