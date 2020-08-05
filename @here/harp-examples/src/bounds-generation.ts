/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    FeaturesDataSource,
    MapViewFeature,
    MapViewMultiPointFeature,
    MapViewPolygonFeature
} from "@here/harp-features-datasource";
import { GeoCoordinates, mercatorProjection } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { BoundsGenerator, CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { OmvDataSource } from "@here/harp-omv-datasource";

import { apikey } from "../config";

export namespace BoundsExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initializeMapView(id: string): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;

        // Look at BERLIN
        const BERLIN = new GeoCoordinates(52.5186234, 13.373993);
        const map = new MapView({
            canvas,
            projection: mercatorProjection,
            tileWrappingEnabled: false,
            theme: {
                extends: "resources/berlin_tilezen_night_reduced.json",
                styles: {
                    geojson: [
                        {
                            when: ["all", ["==", ["geometry-type"], "Polygon"]],
                            technique: "fill",
                            renderOrder: 10003,
                            attr: {
                                color: ["get", "color"], // "#77ccff",
                                opacity: 0.5,
                                lineWidth: 1,
                                lineColor: "#ff0000",
                                enabled: true
                            }
                        },
                        {
                            when: "$geometryType == 'point'",
                            technique: "circles",
                            renderOrder: 10004,
                            attr: {
                                color: "#f0f",
                                size: 10
                            }
                        }
                    ]
                }
            },
            target: BERLIN,
            zoomLevel: 8,
            tilt: 45,
            heading: -80
        });
        map.renderLabels = false;

        CopyrightElementHandler.install("copyrightNotice", map);

        const mapControls = new MapControls(map);
        mapControls.maxTiltAngle = 180;

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addOmvDataSource(map);
        const featureList: MapViewFeature[] = []; //createFeatureList();
        let featuresDataSource: FeaturesDataSource | undefined;
        //@ts-ignore
        featuresDataSource = addFeaturesDataSource(map, featureList);
        let viewpoly: MapViewPolygonFeature;
        let cornerpoints: MapViewMultiPointFeature;
        const boundsGenerator = new BoundsGenerator(
            map.camera,
            map.projection,
            map.tileWrappingEnabled
        );

        window.addEventListener("keyup", event => {
            switch (event.key) {
                case " ":
                    // Generate the the bounds  of the current view and add them as a feature
                    const corners = boundsGenerator.generate();
                    // tslint:disable-next-line: no-console
                    console.log(corners);
                    if (corners && corners.length > 0) {
                        //add starting vertex to the end to close the polygon
                        corners.push(corners[0].clone());
                    }
                    //convert the array to an array usable for the MapViewPolygonFeature
                    const polygonArray: number[][][] = [];
                    const pointArray: number[][] = [];
                    polygonArray.push(pointArray);
                    corners.forEach(corner => {
                        if (corner === null) {
                            return;
                        }
                        pointArray.push([corner.longitude, corner.latitude, 50]);
                    });

                    if (viewpoly) {
                        //remove the former polygon
                        featuresDataSource?.remove(viewpoly);
                    }
                    //add the new polygon
                    viewpoly = new MapViewPolygonFeature(polygonArray, {
                        name: "newpoly",
                        height: 10000,
                        color: "#ffff00"
                    });
                    featuresDataSource?.add(viewpoly);

                    // add circles at the corner points
                    if (cornerpoints) {
                        featuresDataSource?.remove(cornerpoints);
                    }
                    cornerpoints = new MapViewMultiPointFeature(pointArray, {
                        name: "cornerpoints"
                    });
                    featuresDataSource?.add(cornerpoints);
                    break;
                case "l":
                    // tslint:disable-next-line: no-console
                    console.log(
                        "target: ",
                        map.target,
                        " tilt: ",
                        map.tilt,
                        " heading: ",
                        map.heading,
                        " zoom: ",
                        map.zoomLevel,
                        " canvassize: ",
                        map.canvas.height,
                        map.canvas.width,
                        "near: ",
                        map.camera.near,
                        "far: ",
                        map.camera.far
                    );
                    break;
                default:
                    break;
            }
        });

        return map;
    }

    function addOmvDataSource(map: MapView) {
        const omvDataSource = new OmvDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        map.addDataSource(omvDataSource);

        return map;
    }

    function addFeaturesDataSource(map: MapView, featureList: [MapViewFeature]) {
        const featuresDataSource = new FeaturesDataSource({
            name: "featureDataSource",
            styleSetName: "geojson",
            features: featureList,
            gatherFeatureAttributes: true
        });
        map.addDataSource(featuresDataSource);
        return featuresDataSource;
    }

    export const mapView = initializeMapView("mapCanvas");
}
