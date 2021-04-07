/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    FeaturesDataSource,
    MapViewFeature,
    MapViewMultiPointFeature,
    MapViewPolygonFeature
} from "@here/harp-features-datasource";
import {
    GeoBox,
    GeoCoordinates,
    GeoPolygon,
    mercatorProjection,
    sphereProjection
} from "@here/harp-geoutils";
import { geoCoordLikeToGeoPointLike } from "@here/harp-geoutils/lib/coordinates/GeoCoordLike";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { BoundsGenerator, CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";

import { apikey } from "../config";

export namespace BoundsExample {
    const message = document.createElement("div");
    message.innerHTML = `
  <br />  Press "space" to generate and draw a bounds polygon of the current view
  <br />  Press "h" to look at the last created Polygon's BoundingBox
  <br />  Press "g" to look at the last created Polygon
  <br />  Press "b" to show the boundingbox of the Polygon
  <br />  Press "p" to toggle the projection
  <br />  Press "w" to toggle tile wrapping in planar projection`;

    message.style.position = "absolute";
    message.style.cssFloat = "right";
    message.style.top = "10px";
    message.style.right = "10px";
    message.style.textAlign = "left";
    message.style.textShadow = "0px 0px 2px gray";
    document.body.appendChild(message);

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
                            when: [
                                "all",
                                ["==", ["geometry-type"], "Polygon"],
                                ["==", ["get", "name"], "bounds"]
                            ],
                            technique: "fill",
                            renderOrder: 10003,
                            attr: {
                                color: ["get", "color"], // "#77ccff",
                                opacity: 0.2,
                                lineWidth: 1,
                                lineColor: "#ff0000",
                                enabled: true
                            }
                        },
                        {
                            when: [
                                "all",
                                ["==", ["geometry-type"], "Polygon"],
                                ["==", ["get", "name"], "bbox"]
                            ],
                            technique: "solid-line",
                            renderOrder: 10005,
                            attr: {
                                color: "#0ff",
                                lineWidth: "5px"
                            }
                        },
                        {
                            when: [
                                "all",
                                ["==", ["geometry-type"], "Point"],
                                ["==", ["get", "name"], "bbox"]
                            ],
                            technique: "circles",
                            renderOrder: 10006,
                            attr: {
                                color: "#00f",
                                size: 20
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

        addVectorTileDataSource(map);
        const featuresDataSource = addFeaturesDataSource(map, []);
        const boundsGenerator = new BoundsGenerator(
            map.camera,
            map.projection,
            map.tileWrappingEnabled
        );

        let bounds: GeoPolygon | undefined;
        let showBoundingBox: boolean = false;

        window.addEventListener("keyup", event => {
            switch (event.key) {
                case " ":
                    // Generate the the bounds  of the current view and add them as a feature
                    bounds = boundsGenerator.generate();

                    if (bounds !== undefined) {
                        updateBoundsFeatures(bounds, featuresDataSource);
                        updateBoundingBoxFeatures(bounds, featuresDataSource, showBoundingBox);
                    }
                    break;
                case "h":
                    map.lookAt({ bounds: bounds?.getGeoBoundingBox() });
                    break;
                case "g":
                    map.lookAt({ bounds });
                    break;
                case "p":
                    boundsGenerator.projection = map.projection =
                        map.projection === mercatorProjection
                            ? sphereProjection
                            : mercatorProjection;
                    break;
                case "b":
                    if (bounds) {
                        showBoundingBox = showBoundingBox ? false : true;
                        updateBoundingBoxFeatures(bounds, featuresDataSource, showBoundingBox);
                    }
                    break;
                case "l":
                    // eslint-disable-next-line no-console
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
                case "w":
                    mapView.tileWrappingEnabled = !mapView.tileWrappingEnabled;
                    boundsGenerator.tileWrappingEnabled = mapView.tileWrappingEnabled;
                    mapView.update();
                    break;
                default:
                    break;
            }
        });

        return map;
    }

    let viewpoly: MapViewPolygonFeature;
    let cornerpoints: MapViewMultiPointFeature;
    let bboxFeature: MapViewMultiPointFeature;
    let bboxPolygonFeature: MapViewPolygonFeature;

    function updateBoundsFeatures(polygon: GeoPolygon, featuresDataSource: FeaturesDataSource) {
        const corners = polygon.coordinates;
        if (corners && corners.length > 0) {
            //add starting vertex to the end to close the polygon
            corners.push((corners[0] as GeoCoordinates).clone());
        }
        //convert the array to an array usable for the MapViewPolygonFeature
        const polygonArray: number[][][] = [];
        const pointArray: number[][] = [];
        polygonArray.push(pointArray);
        corners.forEach(corner => {
            if (corner === null) {
                return;
            }
            pointArray.push(geoCoordLikeToGeoPointLike(corner) as number[]);
        });

        if (viewpoly) {
            //remove the former polygon
            featuresDataSource?.remove(viewpoly);
        }
        //add the new polygon
        viewpoly = new MapViewPolygonFeature(polygonArray, {
            name: "bounds",
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
    }

    function updateBoundingBoxFeatures(
        geoPolygon: GeoPolygon,
        featuresDataSource: FeaturesDataSource,
        isVisible: boolean = true
    ) {
        if (bboxFeature) {
            featuresDataSource?.remove(bboxFeature);
        }
        if (bboxPolygonFeature) {
            featuresDataSource?.remove(bboxPolygonFeature);
        }
        if (isVisible) {
            const geoBBox = geoPolygon.getGeoBoundingBox() as GeoBox;

            const geoBBoxCornerArray: number[][] = [];
            [
                new GeoCoordinates(geoBBox?.south, geoBBox?.west, 70),
                new GeoCoordinates(geoBBox?.south, geoBBox?.east, 70),
                new GeoCoordinates(geoBBox?.north, geoBBox?.east, 70),
                new GeoCoordinates(geoBBox?.north, geoBBox?.west, 70),
                new GeoCoordinates(geoBBox?.south, geoBBox?.west, 70)
            ].forEach(point => {
                if (!point) {
                    return;
                }
                geoBBoxCornerArray.push([
                    point.longitude,
                    point.latitude,
                    point.altitude as number
                ]);
            });
            const centroid = geoPolygon.getCentroid() as GeoCoordinates;
            bboxFeature = new MapViewMultiPointFeature(
                [[centroid.longitude, centroid.latitude, 70]].concat(geoBBoxCornerArray),
                {
                    name: "bbox"
                }
            );
            featuresDataSource?.add(bboxFeature);
            bboxPolygonFeature = new MapViewPolygonFeature([geoBBoxCornerArray], {
                name: "bbox"
            });
            featuresDataSource?.add(bboxPolygonFeature);
        }
    }

    function addVectorTileDataSource(map: MapView) {
        const omvDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        map.addDataSource(omvDataSource);

        return map;
    }

    function addFeaturesDataSource(map: MapView, featureList: MapViewFeature[]) {
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
