/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    FeatureCollection,
    FlatTheme,
    LineCaps,
    SolidLineTechniqueParams,
    Style
} from "@here/harp-datasource-protocol";
import { GeoPointLike } from "@here/harp-geoutils";
import { LookAtParams } from "@here/harp-mapview";
import * as turf from "@turf/turf";
import { assert } from "chai";
import * as THREE from "three";

import { GeoJsonStore } from "./utils/GeoJsonStore";
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

describe("GeoJson features", function () {
    const geoJsonTest = new GeoJsonTest();

    const lights = ThemeBuilder.lights;

    afterEach(() => geoJsonTest.dispose());

    it("Stroke Circle", async function () {
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

    it("Extrude Circle", async function () {
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

    describe("Stroke Arcs", async function () {
        const lineCaps: LineCaps[] = ["None", "Round", "Square", "TriangleIn", "TriangleOut"];

        lineCaps.forEach(caps => {
            it(`Stroke Arc using from 0 to 300 using '${caps}' caps`, async function () {
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

    describe("Stroke Circles created using lineArc", async function () {
        const lineCaps: LineCaps[] = ["None", "Round", "Square", "TriangleIn", "TriangleOut"];

        lineCaps.forEach(caps => {
            it(`Stroke Arc from 0 to 360 using '${caps}' caps`, async function () {
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

    describe("extruded-polygon technique", async function () {
        // Helper function to test the winding of the rings.

        const isClockWise = (ring: turf.Position[]) =>
            THREE.ShapeUtils.isClockWise(ring.map(p => new THREE.Vector2().fromArray(p)));

        // the theme used by this test suite.
        const theme: FlatTheme = {
            lights,
            styles: [
                {
                    styleSet: "geojson",
                    technique: "extruded-polygon",
                    color: "#0335a2",
                    lineWidth: 1,
                    lineColor: "red",
                    constantHeight: true,
                    height: 300
                }
            ]
        };

        // the polygon feature
        const polygon = turf.polygon([
            [
                [0.00671649362467299, 51.49353450058163, 0],
                [0.006598810705050831, 51.48737650885326, 0],
                [0.015169103358567556, 51.48731300784492, 0],
                [0.015286786278189713, 51.49347100814989, 0],
                [0.006716493624672999, 51.49353450058163, 0],
                [0.00671649362467299, 51.49353450058163, 0]
            ]
        ]);

        // the center geo location of the polygon
        const [longitude, latitude] = turf.center(polygon).geometry!.coordinates;

        // the default camera setup used by this test suite.
        const lookAt: Partial<LookAtParams> = {
            target: [longitude, latitude],
            zoomLevel: 15,
            tilt: 40,
            heading: 45
        };

        it("Clockwise polygon touching tile border", async function () {
            const dataProvider = new GeoJsonStore();

            dataProvider.features.insert(polygon);

            await geoJsonTest.run({
                mochaTest: this,
                dataProvider,
                testImageName: `geojson-extruded-polygon-touching-tile-bounds`,
                lookAt,
                theme
            });
        });

        it("Clockwise polygon with a hole", async function () {
            const dataProvider = new GeoJsonStore();

            const innerPolygon = turf.transformScale(polygon, 0.8, { origin: "center" });

            const polygonWithHole = turf.difference(polygon, innerPolygon)!;

            dataProvider.features.insert(polygonWithHole);

            assert.strictEqual(polygonWithHole?.geometry?.coordinates.length, 2);

            const outerRing = polygonWithHole.geometry!.coordinates[0] as turf.Position[];
            const innerRing = polygonWithHole.geometry!.coordinates[1] as turf.Position[];

            // test that the winding of the inner ring is opposite to the winding
            // of the outer ring.
            assert.notStrictEqual(isClockWise(outerRing), isClockWise(innerRing));

            await geoJsonTest.run({
                mochaTest: this,
                dataProvider,
                testImageName: `geojson-extruded-polygon-cw-with-hole`,
                lookAt,
                theme
            });
        });

        it("Clockwise polygon with a hole wrong winding", async function () {
            const dataProvider = new GeoJsonStore();

            const innerPolygon = turf.transformScale(polygon, 0.8, { origin: "center" });

            const polygonWithHole = turf.difference(polygon, innerPolygon)!;

            dataProvider.features.insert(polygonWithHole);

            assert.strictEqual(polygonWithHole?.geometry?.coordinates.length, 2);

            const outerRing = polygonWithHole.geometry!.coordinates[0] as turf.Position[];
            const innerRing = polygonWithHole.geometry!.coordinates[1] as turf.Position[];

            // reverse the winding of the inner ring so to have the same winding
            // of the outer ring
            innerRing.reverse();

            // verify that the winding of the rings is the same
            assert.strictEqual(isClockWise(outerRing), isClockWise(innerRing));

            await geoJsonTest.run({
                mochaTest: this,
                dataProvider,
                testImageName: `geojson-extruded-polygon-cw-wrong-winding-of-inner-ring`,
                lookAt,
                theme
            });
        });

        it("Clockwise multi-polygon with a hole wrong winding", async function () {
            const dataProvider = new GeoJsonStore();

            const scaledPolygon = turf.transformScale(polygon, 0.5, { origin: "center" });

            const innerPolygon = turf.transformScale(scaledPolygon, 0.8, { origin: "center" });

            const polygonWithHole = turf.difference(scaledPolygon, innerPolygon)!;

            const otherPolygonWithHole = turf.clone(polygonWithHole)!;

            turf.transformTranslate(polygonWithHole, 200, 90, { units: "meters", mutate: true });

            turf.transformTranslate(otherPolygonWithHole, 200, -90, {
                units: "meters",
                mutate: true
            });

            const multi = turf.union(polygonWithHole as any, otherPolygonWithHole as any);

            assert.strictEqual(multi.geometry?.type, "MultiPolygon");

            dataProvider.features.insert(multi);

            await geoJsonTest.run({
                mochaTest: this,
                dataProvider,
                testImageName: `geojson-extruded-multi-polygon-cw-wrong-winding-of-inner-ring`,
                lookAt,
                theme
            });
        });
    });

    describe("fill technqiue", async function () {
        it("Stroked enclosed polygons", async function () {
            const box1 = turf.bboxPolygon([-0.1, -0.1, 0.1, 0.1]);

            box1.properties = {
                "fill-color": "rgba(0, 255, 0, 0.5)",
                "render-order": 2,
                "stroke-color": "rgba(0, 255, 255, 0.5)",
                "stroke-size": 40,
                "stroke-render-order": 2.5
            };

            const box2 = turf.bboxPolygon([-0.4, -0.4, 0.4, 0.4]);

            box2.properties = {
                "fill-color": "rgba(255, 0, 0, 0.5)",
                "render-order": 1,
                "stroke-color": "rgba(0, 0, 255, 0.5)",
                "stroke-size": 40,
                "stroke-render-order": 1.5
            };

            const dataProvider = new GeoJsonStore();

            dataProvider.features.insert(box1);
            dataProvider.features.insert(box2);

            await geoJsonTest.run({
                mochaTest: this,
                dataProvider,
                testImageName: `geojson-stroked-enclosed-polygons`,
                lookAt: {
                    target: [0, 0],
                    zoomLevel: 8.8
                },
                theme: {
                    lights: ThemeBuilder.lights,
                    styles: [
                        {
                            styleSet: "geojson",
                            technique: "fill",
                            color: ["get", "fill-color"],
                            renderOrder: ["get", "render-order"]
                        },
                        {
                            styleSet: "geojson",
                            technique: "solid-line",
                            color: ["get", "stroke-color"],
                            lineWidth: ["world-ppi-scale", ["get", "stroke-size"]],
                            renderOrder: ["get", "stroke-render-order"],
                            clipping: true
                        }
                    ]
                }
            });
        });
    });
});
