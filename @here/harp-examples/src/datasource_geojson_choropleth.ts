/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Style, StyleSet, Theme } from "@here/harp-datasource-protocol";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { GeoJsonDataProvider, VectorTileDataSource } from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey } from "../config";

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
            #info{
                color: #fff;
                width: 80%;
                left: 50%;
                position: relative;
                margin: 10px 0 0 -40%;
                font-size: 15px;
            }
            @media screen and (max-width: 700px) {
                #info{
                    font-size:11px;
                }
            }
        </style>
        <p id=info></p>
    `;

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeBaseMap(id: string, theme: Theme): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme
        });

        mapView.lookAt({
            target: new GeoCoordinates(42, 14),
            zoomLevel: 7,
            tilt: 40,
            heading: -70
        });

        const controls = new MapControls(mapView);

        // Add an UI.
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const baseMapDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        mapView.addDataSource(baseMapDataSource);

        return mapView;
    }

    /**
     * A generator for a heatmap-like [[StyleSet]].
     *
     * @param options - Heatmap settings.
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
            color.multiplyScalar(((i + 1) * 0.8) / length + 0.2);
            const max = options.thresholds[i];
            const min = i - 1 < 0 ? 0 : options.thresholds[i - 1];
            // snippet:geojson_heatmap1.ts
            const propertyName = options.property;
            const style: Style = {
                description: "geoJson property-based style",
                technique: "extruded-polygon",
                when:
                    `$geometryType == 'polygon'` +
                    `&& ${propertyName} > ${min}` +
                    `&& ${propertyName} <= ${max}`,
                attr: {
                    color: "#" + color.getHexString(),
                    transparent: true,
                    opacity: 0.8,
                    constantHeight: true,
                    boundaryWalls: false,
                    lineWidth: {
                        interpolation: "Discrete",
                        zoomLevels: [10, 11, 12],
                        values: [1.0, 1.0, 1.0]
                    }
                },
                renderOrder: 1000
            };
            // end:geojson_heatmap1.ts
            styleSet.push(style);
        }
        return styleSet;
    }

    // snippet:geojson_heatmap2.ts
    const densityStyleSet: StyleSet = generateHeatStyleSet({
        property: "density",
        thresholds: [50, 100, 150, 200, 250, 300, 350, 400, 450],
        color: "#ff6600"
    });
    // end:geojson_heatmap2.ts

    // snippet:geojson_heatmap3.ts
    const customTheme = {
        extends: "resources/berlin_tilezen_night_reduced.json",
        styles: {
            geojson: densityStyleSet
        }
    };
    // end:geojson_heatmap3.ts
    const baseMap = initializeBaseMap("mapCanvas", customTheme);

    const geoJsonDataProvider = new GeoJsonDataProvider(
        "italy",
        new URL("resources/italy.json", window.location.href)
    );
    const geoJsonDataSource = new VectorTileDataSource({
        dataProvider: geoJsonDataProvider,
        styleSetName: "geojson"
    });
    baseMap.addDataSource(geoJsonDataSource);

    const infoElement = document.getElementById("info") as HTMLParagraphElement;
    infoElement.innerHTML =
        `This choropleth shows how to use custom styling to highlight specific features in the` +
        ` map. Here some height is given to the extruded polygons directly in the GeoJSON, ` +
        `whereas the color comes from the population density given in the properties.`;
}
