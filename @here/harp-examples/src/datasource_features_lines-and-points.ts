/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { StyleSet, Theme } from "@here/harp-datasource-protocol";
import {
    FeaturesDataSource,
    MapViewFeature,
    MapViewLineFeature,
    MapViewMultiPointFeature
} from "@here/harp-features-datasource";
import { GeoCoordinates, sphereProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { apikey } from "../config";
import { faults, hotspots } from "../resources/geology";

/**
 * This example illustrates how to add user lines and points in [[MapView]]. As custom features,
 * they are handled through a [[FeaturesDataSource]].
 *
 * First we create a base map, but with customized theme which derives from default, but adds
 * custom [[StyleSet]] - `myStyleSet` - which will be used by datasource with our features.
 *
 * For more details, check the `hello` example.
 * ```typescript
 * [[include:harp_demo_features_linespoints_0.ts]]
 * ```
 *
 * Then we generate all the [[MapViewLineFeature]]s, with the desired text string to use for the
 * text style, straight from the data:
 * ```typescript
 * [[include:harp_demo_features_linespoints_1.ts]]
 * ```
 *
 * We also add the hotspots in the earth's mantle as a [[MapViewMultiPointFeature]].
 * ```typescript
 * [[include:harp_demo_features_linespoints_2.ts]]
 * ```
 *
 * Then we use the general [[DataSource]] mechanism: the [[FeaturesDataSource]] is created, added
 * to [[MapView]], the [[MapViewFeature]]s are added to it, and we specify [[StyleSet]] name set
 * previously in map theme.
 * ```typescript
 * [[include:harp_demo_features_linespoints_3.ts]]
 * ```
 *
 * Note how the [[StyleSet]] of this example creates the text paths out of the line features. Also,
 * we duplicate the line styles, one being a dashed line and the other a solid line, to have this
 * specific look for the ridges and trenches. The point style is also duplicated, so that a bigger
 * point is rendered below the first one, and creates an outline effect.
 */
export namespace LinesPointsFeaturesExample {
    // snippet:harp_demo_features_linespoints_0.ts
    const customizedTheme: Theme = {
        extends: "resources/berlin_tilezen_day_reduced.json",
        sky: {
            type: "gradient",
            topColor: "#898470",
            bottomColor: "#898470",
            groundColor: "#898470"
        },
        definitions: {
            northPoleColor: {
                type: "color",
                value: "#B1AC9C"
            },
            southPoleColor: {
                type: "color",
                value: "#c3bdae"
            }
        },
        styles: {
            myStyleSet: getStyleSet(),
            polar: [
                {
                    description: "North pole",
                    when: ["==", ["get", "kind"], "north_pole"],
                    technique: "fill",
                    attr: {
                        color: ["ref", "northPoleColor"]
                    },
                    renderOrder: 5
                },
                {
                    description: "South pole",
                    when: ["==", ["get", "kind"], "south_pole"],
                    technique: "fill",
                    attr: {
                        color: ["ref", "southPoleColor"]
                    },
                    renderOrder: 5
                }
            ]
        }
    };
    const map = createBaseMap(customizedTheme);
    // end:harp_demo_features_linespoints_0.ts

    // snippet:harp_demo_features_linespoints_3.ts
    const featuresDataSource = new FeaturesDataSource({
        name: "geojson",
        styleSetName: "myStyleSet",
        features: getFeatures(faults)
    });
    map.addDataSource(featuresDataSource);
    // end:harp_demo_features_linespoints_3.ts

    function getFeatures(features: {
        [key: string]: { [key: string]: number[][] };
    }): MapViewFeature[] {
        const featuresList: MapViewFeature[] = [];
        for (const type of Object.keys(features)) {
            for (const featureName of Object.keys(features[type])) {
                const name = !featureName.includes("unknown") ? featureName : undefined;
                // snippet:harp_demo_features_linespoints_1.ts
                const feature = new MapViewLineFeature(features[type][featureName], { name, type });
                // end:harp_demo_features_linespoints_1.ts
                featuresList.push(feature);
            }
        }
        // snippet:harp_demo_features_linespoints_1.ts
        const hotspotsFeature = new MapViewMultiPointFeature(hotspots);
        // end:harp_demo_features_linespoints_1.ts
        featuresList.push(hotspotsFeature);
        return featuresList;
    }

    function getStyleSet(): StyleSet {
        return [
            {
                when: "$geometryType == 'line' && type == 'ridges'",
                technique: "dashed-line",
                renderOrder: 10003,
                attr: {
                    color: "#fc3",
                    lineWidth: 15,
                    metricUnit: "Pixel",
                    gapSize: 15,
                    dashSize: 1
                }
            },
            {
                when: "$geometryType == 'line' && type == 'ridges'",
                technique: "solid-line",
                renderOrder: 10003,
                attr: {
                    color: "#fc3",
                    lineWidth: 1,
                    metricUnit: "Pixel"
                }
            },
            {
                when: "$geometryType == 'line' && type == 'trenches'",
                technique: "dashed-line",
                renderOrder: 10002,
                attr: {
                    color: "#09f",
                    lineWidth: 10,
                    metricUnit: "Pixel",
                    gapSize: 10,
                    dashSize: 1
                }
            },
            {
                when: "$geometryType == 'line' && type == 'trenches'",
                technique: "solid-line",
                renderOrder: 10002,
                attr: {
                    color: "#09f",
                    lineWidth: 1,
                    metricUnit: "Pixel"
                }
            },
            {
                when: "$geometryType == 'point'",
                technique: "circles",
                renderOrder: 10001,
                attr: {
                    color: "#ca6",
                    size: 6
                }
            },
            {
                when: "$geometryType == 'point'",
                technique: "circles",
                renderOrder: 10000,
                attr: {
                    color: "#a83",
                    size: 8
                }
            },
            {
                when: "$geometryType == 'line'",
                technique: "text",
                attr: {
                    color: "#333",
                    size: 15
                }
            }
        ];
    }

    function createBaseMap(theme: Theme): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            projection: sphereProjection,
            theme,
            target: new GeoCoordinates(10, -270),
            zoomLevel: 3.5,
            enableMixedLod: true
        });

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls, { projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const baseMap = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });
        mapView.addDataSource(baseMap);

        return mapView;
    }

    function getExampleHTML() {
        return (
            `
            <style>
                #mapCanvas {
                    top: 0;
                }
                #info{
                    color: #fff;
                    width: 80%;
                    text-align: center;
                    font-family: monospace;
                    left: 50%;
                    position: relative;
                    margin: 10px 0 0 -40%;
                    font-size: 15px;
                }
                #caption-bg{
                    display: inline-block;
                    background: rgba(255,255,255,0.8);
                    border-radius: 4px;
                    max-width:calc(100% - 150px);
                    margin: 0 10px;
                }
                #caption{
                    width: 100%;
                    position: absolute;
                    bottom: 25px;
                    text-align:center;
                    font-family: Arial;
                    color:#222;
                }
                h1{
                    font-size:15px;
                    text-transform: uppercase;
                    padding: 5px 15px;
                    display: inline-block;
                }
                @media screen and (max-width: 700px) {
                    #info{
                        font-size:11px;
                    }
                    h1{
                        padding:0px;
                        margin:5px
                    }
                }
                </style>
                <p id=info>This example demonstrates user points, lines and text paths. The text ` +
            `string is taken from the "name" property defined in the custom features. The style ` +
            `of the lines is property-based.</p>
                <div id=caption>
                    <div id=caption-bg>
                        <h1>Hotspots on Earth's mantle, with main ridges and trenches.</h1>
                    </div>
                </div>
        `
        );
    }
}
