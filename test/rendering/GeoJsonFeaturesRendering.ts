/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    FeatureCollection,
    LineCaps,
    SolidLineTechniqueParams,
    Style
} from "@here/harp-datasource-protocol";
import { GeoPointLike } from "@here/harp-geoutils";
import * as turf from "@turf/turf";

import { GeoJsonTest } from "./utils/GeoJsonTest";
import { ThemeBuilder } from "./utils/ThemeBuilder";

const strokePolygonLayer = (params: Partial<SolidLineTechniqueParams> = {}): Style => {
    return {
        id: "stroke-polygon",
        styleSet: "geojson",
        technique: "solid-line",
        color: "orange",
        lineWidth: ["world-ppi-scale", 20],
        secondaryColor: "magenta",
        secondaryWidth: ["world-ppi-scale", 35],
        ...(params as any)
    };
};

describe("GeoJson features", function() {
    const geoJsonTest = new GeoJsonTest();

    const lights = ThemeBuilder.lights;

    afterEach(() => geoJsonTest.dispose());

    it("Stroke Circle", async function() {
        const pos = [13.2, 53.2];

        const circle = turf.circle(pos, 600, {
            units: "meters"
        });

        const geoJson = turf.featureCollection([circle]);

        await geoJsonTest.run({
            testImageName: "geojson-stroke-circle",
            mochaTest: this,
            geoJson: geoJson as FeatureCollection,
            lookAt: {
                target: pos as GeoPointLike,
                zoomLevel: 14
            },
            theme: {
                lights,
                styles: [
                    strokePolygonLayer({
                        lineWidth: ["world-ppi-scale", 50],
                        secondaryWidth: ["world-ppi-scale", 80]
                    })
                ]
            }
        });
    });

    it("Extrude Circle", async function() {
        const pos = [13.2, 53.2];

        const circle = turf.circle(pos, 600, {
            units: "meters"
        });

        const geoJson = turf.featureCollection([circle]);

        await geoJsonTest.run({
            testImageName: "geojson-extruded-circle",
            mochaTest: this,
            geoJson: geoJson as FeatureCollection,
            lookAt: {
                target: pos as GeoPointLike,
                zoomLevel: 14,
                tilt: 60
            },
            theme: {
                lights,
                styles: [
                    {
                        styleSet: "geojson",
                        technique: "extruded-polygon",
                        color: "red",
                        constantHeight: true,
                        height: 700
                    }
                ]
            }
        });
    });

    describe("Stroke Arcs", async function() {
        const lineCaps: LineCaps[] = ["None", "Round", "Square", "TriangleIn", "TriangleOut"];

        lineCaps.forEach(caps => {
            it(`Stroke Arc using from 0 to 300 using '${caps}' caps`, async function() {
                const center = [13.2, 53.2];

                const arc = turf.lineArc(center, 5, 0, 300);

                const geoJson = turf.featureCollection([arc]);

                await geoJsonTest.run({
                    mochaTest: this,
                    geoJson: geoJson as FeatureCollection,
                    testImageName: `stroke-arc-with-caps-${caps}`,
                    lookAt: {
                        target: center as GeoPointLike,
                        zoomLevel: 10
                    },
                    theme: {
                        lights,
                        styles: [strokePolygonLayer({ caps })]
                    }
                });
            });
        });
    });

    describe("Stroke Circles created using lineArc", async function() {
        const lineCaps: LineCaps[] = ["None", "Round", "Square", "TriangleIn", "TriangleOut"];

        lineCaps.forEach(caps => {
            it(`Stroke Arc from 0 to 360 using '${caps}' caps`, async function() {
                const center = [13.2, 53.2];

                const arc = turf.lineArc(center, 5, 0, 360);

                const geoJson = turf.featureCollection([arc]);

                await geoJsonTest.run({
                    mochaTest: this,
                    geoJson: geoJson as FeatureCollection,
                    testImageName: `stroke-circles-creates-from-arcs-${caps}`,
                    lookAt: {
                        target: center as GeoPointLike,
                        zoomLevel: 10
                    },
                    theme: {
                        lights,
                        styles: [strokePolygonLayer({ caps })]
                    }
                });
            });
        });
    });
});
