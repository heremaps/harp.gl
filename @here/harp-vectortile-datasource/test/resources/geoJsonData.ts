/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { FeatureCollection, Theme } from "@here/harp-datasource-protocol";

export const GEOJSON_DATA: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {
                name: "Some Test Polygon"
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [1.9335937499999998, 25.3241665257384],
                        [5.09765625, 21.616579336740603],
                        [13.886718749999998, 22.268764039073968],
                        [10.72265625, 28.92163128242129],
                        [1.9335937499999998, 25.3241665257384]
                    ]
                ]
            }
        },
        {
            type: "Feature",
            properties: {
                name: "Some Test Line"
            },
            geometry: {
                type: "LineString",
                coordinates: [
                    [-7.119140625, 22.187404991398775],
                    [-6.0205078125, 14.689881366618762],
                    [-3.2958984375, 21.57571893245848]
                ]
            }
        },
        {
            type: "Feature",
            properties: {
                name: "Some Test Point",
                $id: "01"
            },
            geometry: {
                type: "Point",
                coordinates: [-2.900390625, 26.115985925333536]
            }
        },
        {
            type: "Feature",
            properties: {
                name: "Polygon Outline"
            },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-1.0, 14.86],
                        [0.57, 14.86],
                        [0.57, 29.46],
                        [-1.0, 29.46],
                        [-1.0, 14.86]
                    ]
                ]
            }
        }
    ]
};

export const THEME: Theme = {
    // INFO: Commented out until text renderer refactor (CI build fails).
    // defaultTextStyle: {
    //     name: "defaultTextStyle",
    //     color: "#6D7477",
    //     fontCatalogName: "fira"
    // },
    // textStyles: [],
    // fontCatalogs: [
    //     {
    //         name: "fira",
    //         url: "fonts/Default_FontCatalog.json"
    //     }
    // ],
    styles: {
        geojson: [
            {
                description: "polygon",
                when: "$geometryType == 'polygon'",
                technique: "fill",
                attr: {
                    color: "#000000"
                },
                renderOrder: 10.3
            },
            {
                styleSet: "geojson",
                when: ["==", ["get", "name"], "Polygon Outline"],
                technique: "fill",
                renderOrder: 10000,
                attr: {
                    color: "yellow",
                    lineWidth: 2,
                    lineColor: "#00ff00",
                    opacity: 0
                }
            },
            {
                description: "line",
                when: "$geometryType == 'line'",
                technique: "solid-line",
                attr: {
                    color: "#000000",
                    lineWidth: 10000,
                    fadeNear: 0.8,
                    fadeFar: 0.9,
                    clipping: false
                },
                renderOrder: 10.3
            },
            {
                description: "label",
                when: "$geometryType == 'point'",
                technique: "text",
                attr: {
                    color: "#000000",
                    backgroundColor: "#FFFFFF",
                    backgroundOpacity: 0.5,
                    size: 8,
                    priority: 100
                },
                renderOrder: 10.3
            }
        ]
    }
};
