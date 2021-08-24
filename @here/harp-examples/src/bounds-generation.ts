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
import { GeoBox, GeoCoordinates, GeoPolygon, mercatorProjection } from "@here/harp-geoutils";
import { geoCoordLikeToGeoPointLike } from "@here/harp-geoutils/lib/coordinates/GeoCoordLike";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { BoundsGenerator, CameraUtils, CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { VectorTileDataSource } from "@here/harp-vectortile-datasource";
import { GUI, GUIController } from "dat.gui";

import { apikey } from "../config";

export namespace BoundsExample {
    // Create a new MapView for the HTMLCanvasElement of the given id.
    function initMapView(id: string): MapView {
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

        const ui = new MapControlsUI(mapControls, { zoomLevel: "input", projectionSwitch: true });
        canvas.parentElement!.appendChild(ui.domElement);

        map.resize(window.innerWidth, window.innerHeight);

        window.addEventListener("resize", () => {
            map.resize(window.innerWidth, window.innerHeight);
        });

        addVectorTileDataSource(map);
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

    function addButton(gui: GUI, name: string, callback: () => void): GUIController {
        return gui.add(
            {
                [name]: callback
            },
            name
        );
    }

    function initGUI(
        map: MapView,
        boundsGenerator: BoundsGenerator,
        viewBoundsDataSource: FeaturesDataSource
    ) {
        const gui = new GUI();
        gui.width = 350;
        let bounds: GeoPolygon | undefined;
        const options = {
            bbox: false,
            wrap: false,
            ppalPointX: 0,
            ppalPointY: 0
        };

        addButton(gui, "Draw view bounds polygon", () => {
            // Generate the the bounds  of the current view and add them as a feature
            bounds = boundsGenerator.generate();

            if (bounds) {
                updateBoundsFeatures(bounds, viewBoundsDataSource);
                updateBoundingBoxFeatures(bounds, viewBoundsDataSource, options.bbox);
            }
        });
        addButton(gui, "Look at bounds bbox", () => {
            map.lookAt({ bounds: bounds?.getGeoBoundingBox() });
        });
        addButton(gui, "Look at bounds polygon", () => {
            map.lookAt({ bounds });
        });
        gui.add(options, "bbox")
            .onChange((enabled: boolean) => {
                if (bounds) {
                    updateBoundingBoxFeatures(bounds, viewBoundsDataSource, enabled);
                }
            })
            .name("Show polygon's bbox");
        gui.add(options, "wrap")
            .onChange((enabled: boolean) => {
                map.tileWrappingEnabled = enabled;
                map.update();
            })
            .name("Repeat world (planar)");
        const ppFolder = gui.addFolder("Principal point (NDC)");
        ppFolder
            .add(options, "ppalPointX", -1, 1, 0.1)
            .onChange((x: number) => {
                CameraUtils.setPrincipalPoint(map.camera, {
                    x,
                    y: CameraUtils.getPrincipalPoint(map.camera).y
                });
                map.update();
            })
            .name("x");
        ppFolder
            .add(options, "ppalPointY", -1, 1, 0.1)
            .onChange((y: number) => {
                CameraUtils.setPrincipalPoint(map.camera, {
                    x: CameraUtils.getPrincipalPoint(map.camera).x,
                    y
                });
                map.update();
            })
            .name("y");
        addButton(gui, "Log camera settings", () => {
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
        });
    }

    export const mapView = initMapView("mapCanvas");
    const boundsGenerator = new BoundsGenerator(mapView);
    const viewBoundsDataSource = addFeaturesDataSource(mapView, []);
    initGUI(mapView, boundsGenerator, viewBoundsDataSource);
}
