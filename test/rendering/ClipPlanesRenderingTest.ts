/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { FeatureCollection, StyleSet } from "@here/harp-datasource-protocol";
import { mercatorProjection, Projection, sphereProjection } from "@here/harp-geoutils";
import { CameraUtils } from "@here/harp-mapview";
import * as THREE from "three";

import { GeoJsonTest } from "./utils/GeoJsonTest";
import { ThemeBuilder } from "./utils/ThemeBuilder";

const style: StyleSet = [
    {
        when: "$geometryType == 'polygon'",
        technique: "fill",
        attr: { color: ["get", "color"], opacity: 1.0 }
    }
];
const theme = { clearColor: "black", lights: ThemeBuilder.lights, styles: { geojson: style } };
const seaworld: FeatureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { color: "#436981" },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [-180, -90],
                        [180, -90],
                        [180, 90],
                        [-180, 90],
                        [-180, -90]
                    ]
                ]
            }
        }
    ]
};

describe("ClipPlanes rendering test", function () {
    interface ClipPlanesTest {
        projection: Projection;
        zoomLevel: number;
        tilt?: number;
        principalPointNDC?: [number, number];
    }

    this.timeout(5000);

    let geoJsonTest: GeoJsonTest;

    beforeEach(function () {
        geoJsonTest = new GeoJsonTest();
    });

    afterEach(() => geoJsonTest.dispose());

    const tests: ClipPlanesTest[] = [
        {
            projection: mercatorProjection,
            zoomLevel: 11,
            tilt: 65
        },
        {
            projection: mercatorProjection,
            zoomLevel: 11,
            tilt: 65,
            principalPointNDC: [0, -0.5]
        },
        {
            projection: mercatorProjection,
            zoomLevel: 11,
            tilt: 70
        },
        {
            projection: mercatorProjection,
            zoomLevel: 11,
            tilt: 70,
            principalPointNDC: [0, 0.5]
        },
        {
            projection: sphereProjection,
            zoomLevel: 11,
            tilt: 65
        },
        {
            projection: sphereProjection,
            zoomLevel: 11,
            tilt: 65,
            principalPointNDC: [0, -0.5]
        },
        {
            projection: sphereProjection,
            zoomLevel: 11,
            tilt: 70
        },
        {
            projection: sphereProjection,
            zoomLevel: 11,
            tilt: 70,
            principalPointNDC: [0, 0.5]
        },
        {
            projection: sphereProjection,
            zoomLevel: 4
        },
        {
            projection: sphereProjection,
            zoomLevel: 4,
            tilt: 45
        },
        {
            projection: sphereProjection,
            zoomLevel: 4,
            principalPointNDC: [-0.7, 0]
        },
        {
            projection: sphereProjection,
            zoomLevel: 4,
            principalPointNDC: [0.7, 0]
        },
        {
            projection: sphereProjection,
            zoomLevel: 4,
            principalPointNDC: [0, -0.9]
        },
        {
            projection: sphereProjection,
            zoomLevel: 4,
            principalPointNDC: [0, 0.9]
        }
    ];
    for (const test of tests) {
        const projection = test.projection;
        const zoomLevel = test.zoomLevel;
        const tilt = test.tilt ?? 0;
        const principalPoint = test.principalPointNDC ?? [0, 0];
        const projName = projection === mercatorProjection ? "mercator" : "sphere";
        const testName = `${projName}, zl${zoomLevel}, tilt ${tilt}, ppal point ${principalPoint}`;
        // For image name, replace test name spaces and commas with dashes and make lower case.
        const testImageName = "clip-planes-" + testName.replace(/[,\s]+/g, "-").toLowerCase();

        it(`${testName}`, async function () {
            await geoJsonTest.run({
                mochaTest: this,
                testImageName,
                theme,
                geoJson: seaworld,
                lookAt: {
                    zoomLevel,
                    target: [0, 0],
                    tilt
                },
                projection,
                beforeFinishCallback: mapView => {
                    CameraUtils.setPrincipalPoint(
                        mapView.camera,
                        new THREE.Vector2().fromArray(principalPoint)
                    );
                }
            });
        });
    }
});
