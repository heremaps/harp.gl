/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { MapEnv, ValueMap } from "../lib/Expr";
import { createInterpolatedProperty } from "../lib/InterpolatedProperty";
import { InterpolatedPropertyDefinition } from "../lib/InterpolatedPropertyDefs";
import { StyleSetEvaluator } from "../lib/StyleSetEvaluator";
import { FillTechnique, isSolidLineTechnique, SolidLineTechnique } from "../lib/Techniques";
import { Definitions, StyleDeclaration, StyleSet } from "../lib/Theme";

describe("StyleSetEvaluator", function() {
    const basicStyleSetAutoOrder: StyleSet = [
        {
            description: "first",
            technique: "fill",
            when: ["==", ["get", "kind"], "bar"], // "kind == 'bar'",
            attr: { color: "yellow" }
        },
        {
            description: "second",
            technique: "fill",
            when: "kind == 'park'",
            attr: { color: "green" }
        }
    ];

    it("doesn't modify input style set", function() {
        const ev = new StyleSetEvaluator(basicStyleSetAutoOrder);
        const parsedStyles = ev.styleSet;

        ev.getMatchingTechniques(new MapEnv({ kind: "bar" }));

        assert.notEqual(parsedStyles[0].renderOrder, undefined);
        assert.notEqual(parsedStyles[1].renderOrder, undefined);
        assert.notEqual(parsedStyles[0]._whenExpr, undefined);
        assert.notEqual(parsedStyles[1]._whenExpr, undefined);
        assert.equal((basicStyleSetAutoOrder[0] as any).renderOrder, undefined);
        assert.equal((basicStyleSetAutoOrder[1] as any).renderOrder, undefined);
        assert.equal((basicStyleSetAutoOrder[0] as any)._whenExpr, undefined);
        assert.equal((basicStyleSetAutoOrder[1] as any)._whenExpr, undefined);
        assert.equal((basicStyleSetAutoOrder[0] as any)._index, undefined);
        assert.equal((basicStyleSetAutoOrder[1] as any)._index, undefined);
    });

    it("finds techniques with equality operator", function() {
        const ev = new StyleSetEvaluator(basicStyleSetAutoOrder);
        const result = ev.getMatchingTechniques(new MapEnv({ kind: "bar" }));

        assert.equal(result.length, 1);
        assert.deepNestedInclude(result[0], {
            name: "fill",
            color: "yellow",
            renderOrder: 0
        });
    });

    it("matches multiple techniques style", function() {
        const ev = new StyleSetEvaluator([
            basicStyleSetAutoOrder[0],
            {
                description: "injected",
                technique: "fill",
                when: "kind == 'park'",
                attr: { color: "red" }
            },
            basicStyleSetAutoOrder[1]
        ]);
        const result = ev.getMatchingTechniques(new MapEnv({ kind: "park" }));

        assert.equal(result.length, 2);
        assert.deepNestedInclude(result[0], {
            name: "fill",
            color: "red",
            renderOrder: 1
        });
        assert.deepNestedInclude(result[1], {
            name: "fill",
            color: "green",
            renderOrder: 2
        });
    });

    it("supports final style", function() {
        const ev = new StyleSetEvaluator([
            basicStyleSetAutoOrder[0],
            {
                description: "injected",
                technique: "fill",
                when: "kind == 'park'",
                final: true,
                attr: { color: "red" }
            },
            basicStyleSetAutoOrder[1]
        ]);
        const result = ev.getMatchingTechniques(new MapEnv({ kind: "park" }));

        assert.equal(result.length, 1);
        assert.deepNestedInclude(result[0], {
            name: "fill",
            color: "red",
            renderOrder: 1
        });
    });

    it("generates implicit renderOrder", function() {
        const ev = new StyleSetEvaluator(basicStyleSetAutoOrder);

        const parsedStyles = ev.styleSet;
        assert.equal(parsedStyles[0].renderOrder, 0);
        assert.equal(parsedStyles[1].renderOrder, 1);
    });
    it("properly mixes auto-generated and explicit renderOrder", function() {
        const ev = new StyleSetEvaluator([
            {
                description: "foo",
                technique: "fill",
                when: "kind == 'ground'",
                renderOrder: 33,
                attr: { color: "brown" }
            },
            ...basicStyleSetAutoOrder
        ]);

        const parsedStyles = ev.styleSet;
        assert.equal(parsedStyles[0].renderOrder, 33);

        assert.equal(parsedStyles[0].renderOrder, 33);
        assert.equal(parsedStyles[1].renderOrder, 0);
        assert.equal(parsedStyles[2].renderOrder, 1);
    });

    describe("dynamic technique atribute support", function() {
        const testStyle: StyleSet = [
            {
                technique: "solid-line",
                when: "kind == 'park'",
                renderOrder: ["get", "area"],
                attr: {
                    lineWidth: ["get", "area"],
                    color: "#00aa00",
                    secondaryRenderOrder: ["get", "area"],
                    clipping: ["!", ["get", "clipping"]]
                }
            }
        ];
        it("instantiates two techniques from one styleset basing on expression result", function() {
            const ev = new StyleSetEvaluator(testStyle);
            const r1 = ev.getMatchingTechniques(
                new MapEnv({ kind: "park", area: 2, clipping: true })
            );
            const r2 = ev.getMatchingTechniques(
                new MapEnv({ kind: "park", area: 3, clipping: false })
            );

            assert.notStrictEqual(r1, r2);

            assert.equal(ev.techniques.length, 2);

            assert.equal(r1.length, 1);
            assert.isTrue(isSolidLineTechnique(r1[0]));
            assert.equal((r1[0] as SolidLineTechnique).clipping, false);
            assert.equal((r1[0] as SolidLineTechnique).lineWidth, 2);
            assert.equal(r1[0].renderOrder, 2);

            assert.isTrue(isSolidLineTechnique(r2[0]));
            assert.equal((r2[0] as SolidLineTechnique).clipping, true);
            assert.equal((r2[0] as SolidLineTechnique).lineWidth, 3);
            assert.equal(r2[0].renderOrder, 3);
        });

        it("generates stable technique cache key", function() {
            const techniquesTileA = (() => {
                const ev = new StyleSetEvaluator(testStyle);
                ev.getMatchingTechniques(new MapEnv({ kind: "park" }));
                ev.getMatchingTechniques(new MapEnv({ kind: "park", area: 2 }));
                ev.getMatchingTechniques(new MapEnv({ kind: "park", area: 3 }));
                return ev.decodedTechniques;
            })();

            assert.equal(techniquesTileA.length, 3);

            const techniquesTileB = (() => {
                const ev = new StyleSetEvaluator(testStyle);
                ev.getMatchingTechniques(new MapEnv({ kind: "park", area: 3 }));
                return ev.decodedTechniques;
            })();

            assert.equal(techniquesTileB.length, 1);

            const techniquesTileC = (() => {
                const ev = new StyleSetEvaluator(testStyle);
                ev.getMatchingTechniques(new MapEnv({ kind: "park", area: 2 }));
                ev.getMatchingTechniques(new MapEnv({ kind: "park" }));
                return ev.decodedTechniques;
            })();

            assert.equal(techniquesTileC.length, 2);

            // delete _index from result techniques, because it may differ
            [...techniquesTileA, ...techniquesTileB, ...techniquesTileC].forEach(t => {
                delete t._index;
            });

            // Now, respective techniques should have same cache key irrespectively to from
            // which tile they come.
            assert.deepEqual(techniquesTileA[1], techniquesTileC[0]);
            assert.deepEqual(techniquesTileA[2], techniquesTileB[0]);
            assert.deepEqual(techniquesTileA[0], techniquesTileC[1]);
        });
    });
    describe('definitions / "ref" operator support', function() {
        const sampleStyleDeclaration: StyleDeclaration = {
            technique: "fill",
            when: ["ref", "expr"],
            attr: { lineWidth: ["ref", "number"], color: ["ref", "interpolator"] }
        };
        const interpolator: InterpolatedPropertyDefinition<string> = {
            interpolation: "Linear",
            zoomLevels: [2, 3],
            values: ["#faa", "#afa"]
        };
        const sampleDefinitions: Definitions = {
            expr: { type: "selector", value: ["==", ["get", "kind"], "park"] },
            number: { type: "number", value: 123 },
            interpolator: {
                type: "color",
                value: interpolator
            }
        };
        it("resolves references in style declaration attributes", function() {
            const sse = new StyleSetEvaluator([sampleStyleDeclaration], sampleDefinitions);
            const techniques = sse.getMatchingTechniques(new MapEnv({ kind: "park" }));

            const expectedInterpolator = createInterpolatedProperty(interpolator);
            assert.equal(techniques.length, 1);
            assert.deepNestedInclude(techniques[0], {
                name: "fill",
                lineWidth: 123,
                color: expectedInterpolator,
                renderOrder: 0
            });
        });
        it("resolves style declaration references", function() {
            const sse = new StyleSetEvaluator([["ref", "style"]], {
                ...sampleDefinitions,
                style: sampleStyleDeclaration
            });
            const techniques = sse.getMatchingTechniques(new MapEnv({ kind: "park" }));

            assert.equal(techniques.length, 1);
            assert.deepNestedInclude(techniques[0], {
                name: "fill",
                lineWidth: 123,
                renderOrder: 0
            });
        });
        it("reuses very same instances of objects from definition table", function() {
            const styleReferencingObject: StyleDeclaration = {
                technique: "fill",
                when: ["ref", "expr"],
                attr: { lineWidth: ["ref", "number"], color: ["ref", "bigObject"] }
            };
            const bigObject = {};
            const definitions: Definitions = {
                ...sampleDefinitions,
                bigObject: ["literal", bigObject]
            };
            const sse = new StyleSetEvaluator([styleReferencingObject], definitions);

            const techniques = sse.getMatchingTechniques(new MapEnv({ kind: "park" }));
            assert.equal(techniques.length, 1);
            assert.strictEqual((techniques[0] as FillTechnique).color as any, bigObject);
        });
    });

    describe("#wantsLayer", function() {
        it("ignores all layers for empty styleset", function() {
            const ss = new StyleSetEvaluator([]);
            assert.isFalse(ss.wantsLayer("foo"));
            assert.isFalse(ss.wantsLayer("bar"));
        });

        it("wants all layers if layer predicate is missing from at least one style", function() {
            const ss = new StyleSetEvaluator([
                {
                    when: ["==", ["get", "foo"], "bar"],
                    technique: "fill"
                }
            ]);
            assert.isTrue(ss.wantsLayer("foo"));
            assert.isTrue(ss.wantsLayer("bar"));
        });
        it("supports both layer and layer predicate", function() {
            const ss = new StyleSetEvaluator([
                {
                    layer: "foo",
                    when: ["==", ["get", "foo"], "bar"],
                    technique: "fill"
                },
                {
                    when: ["all", ["==", ["get", "$layer"], "bar"]],
                    technique: "fill"
                }
            ]);
            assert.isTrue(ss.wantsLayer("foo"));
            assert.isTrue(ss.wantsLayer("bar"));
            assert.isFalse(ss.wantsLayer("baz"));
        });
    });

    describe("#wantsFeature", function() {
        it("ignores all layers for empty styleset", function() {
            const ss = new StyleSetEvaluator([]);
            assert.isFalse(ss.wantsFeature("foo", "point"));
            assert.isFalse(ss.wantsFeature("bar", "polygon"));
            assert.isFalse(ss.wantsFeature("baz", "line"));
        });

        it("wants all features if predicate is missing from at least one style", function() {
            const ss = new StyleSetEvaluator([
                {
                    when: ["==", ["get", "foo"], "bar"],
                    technique: "fill"
                }
            ]);
            assert.isTrue(ss.wantsFeature("foo", "point"));
            assert.isTrue(ss.wantsFeature("bar", "polygon"));
            assert.isTrue(ss.wantsFeature("baz", "line"));
        });

        it("supports ignores all but selected layer/geometry ", function() {
            const ss = new StyleSetEvaluator([
                {
                    when: [
                        "all",
                        ["==", ["get", "$layer"], "bar"],
                        ["==", ["get", "$geometryType"], "polygon"]
                    ],
                    technique: "fill"
                }
            ]);
            assert.isTrue(ss.wantsLayer("bar"));
            assert.isTrue(ss.wantsFeature("bar", "polygon"));
            assert.isFalse(ss.wantsFeature("bar", "line"));
            assert.isFalse(ss.wantsFeature("bar", "point"));

            assert.isFalse(ss.wantsLayer("foo"));
            assert.isFalse(ss.wantsFeature("foo", "polygon"));
        });

        it("works also only with geometryType predicate ", function() {
            const ss = new StyleSetEvaluator([
                {
                    when: ["all", ["==", ["get", "$geometryType"], "polygon"]],
                    technique: "fill"
                }
            ]);
            // should return true for any layer
            assert.isTrue(ss.wantsLayer("bar"));
            assert.isTrue(ss.wantsLayer("baz"));

            // but should return false only for "polygons" in any layer
            assert.isTrue(ss.wantsFeature("bar", "polygon"));
            assert.isFalse(ss.wantsFeature("bar", "line"));
            assert.isFalse(ss.wantsFeature("bar", "point"));
        });
    });

    it("Filter techniques by layer", function() {
        const styleSet: StyleSet = [
            {
                when: [
                    "all",
                    ["==", ["get", "$layer"], "buildings"],
                    ["==", ["get", "$geometryType"], "polygon"]
                ],
                technique: "extruded-polygon"
            },
            {
                layer: "buildings",
                when: ["all", ["==", ["get", "$geometryType"], "polygon"]],
                technique: "text"
            },

            {
                layer: "buildings",
                when: [
                    "all",
                    ["==", ["get", "$layer"], "buildings"],
                    ["==", ["get", "$geometryType"], "polygon"]
                ],
                technique: "solid-line"
            },

            {
                layer: "buildings",
                when: ["all", ["==", ["get", "$layer"], "buildings"]],
                technique: "fill"
            },

            {
                layer: "water",
                when: ["all", ["==", ["get", "$layer"], "buildings"]],
                technique: "fill"
            },

            {
                when: [
                    "all",
                    ["==", ["get", "$layer"], "water"],
                    ["==", ["get", "$geometryType"], "polygon"]
                ],
                technique: "solid-line"
            }
        ];

        const ev = new StyleSetEvaluator(styleSet);

        const techniques = ev.getMatchingTechniques(
            new MapEnv({ $layer: "buildings", $geometryType: "polygon" })
        );

        assert.equal(techniques.length, 4);
        assert.equal(techniques[0].name, "extruded-polygon");
        assert.equal(techniques[1].name, "text");
        assert.equal(techniques[2].name, "solid-line");
        assert.equal(techniques[3].name, "fill");

        // additional cross-checks for wantsLayer/Feature
        assert.isTrue(ev.wantsLayer("buildings"));
        assert.isTrue(ev.wantsLayer("water"));
        assert.isFalse(ev.wantsLayer("foobar"));

        assert.isTrue(ev.wantsFeature("buildings", "polygon"));
        assert.isTrue(ev.wantsFeature("buildings", "line"));
    });

    it("Filter techniques by layer and geometryType", function() {
        const styleSet: StyleSet = [
            {
                when: [
                    "all",
                    ["==", ["get", "$layer"], "buildings"],
                    ["==", ["get", "$geometryType"], "polygon"]
                ],
                technique: "extruded-polygon"
            },
            {
                when: [
                    "all",
                    ["==", ["get", "$layer"], "buildings"],
                    ["==", ["get", "$geometryType"], "line"]
                ],
                technique: "solid-line"
            },
            {
                when: [
                    "all",
                    ["==", ["get", "$layer"], "buildings"],
                    ["==", ["get", "$geometryType"], "point"]
                ],
                technique: "circles"
            }
        ];

        const layer = "buildings";
        const geometryType = "polygon";

        const env = new MapEnv({ $layer: layer, $geometryType: geometryType });

        const styleSetEvaluator = new StyleSetEvaluator(styleSet);

        const techniques = styleSetEvaluator.getMatchingTechniques(env);

        const techniquesFilteredByLayer = styleSetEvaluator.getMatchingTechniques(env, layer);

        const techniquesFilteredByLayerAndGeometryType = styleSetEvaluator.getMatchingTechniques(
            env,
            layer,
            geometryType
        );

        const techniquesFilteredByGeometryType = styleSetEvaluator.getMatchingTechniques(
            env,
            undefined,
            geometryType
        );

        assert.equal(techniques.length, 1);
        assert.equal(techniquesFilteredByLayer.length, 1);
        assert.equal(techniquesFilteredByLayerAndGeometryType.length, 1);
        assert.equal(techniquesFilteredByGeometryType.length, 1);

        assert.equal(techniques[0].name, "extruded-polygon");
        assert.equal(techniquesFilteredByLayer[0].name, "extruded-polygon");
        assert.equal(techniquesFilteredByLayerAndGeometryType[0].name, "extruded-polygon");
        assert.equal(techniquesFilteredByGeometryType[0].name, "extruded-polygon");

        // additional cross-checks for wantsLayer/Feature
        assert.isTrue(styleSetEvaluator.wantsLayer("buildings"));
        assert.isFalse(styleSetEvaluator.wantsLayer("water"));

        assert.isTrue(styleSetEvaluator.wantsFeature("buildings", "polygon"));
        assert.isTrue(styleSetEvaluator.wantsFeature("buildings", "line"));
        assert.isFalse(styleSetEvaluator.wantsFeature("buildings", "foobar"));
    });

    it("Filter techniques by zoom level", function() {
        function getMatchingTechniques(props: ValueMap, styleSet: StyleDeclaration[]) {
            return new StyleSetEvaluator(styleSet).getMatchingTechniques(new MapEnv(props));
        }

        const defaultProperties = {
            $layer: "buildings",
            $geometryType: "polygon"
        };

        assert.isNotEmpty(
            getMatchingTechniques({ ...defaultProperties, $zoom: 15 }, [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon"
                }
            ])
        );

        assert.isNotEmpty(
            getMatchingTechniques({ ...defaultProperties, $zoom: 15 }, [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    minZoomLevel: 14,
                    maxZoomLevel: 15
                }
            ])
        );

        assert.isNotEmpty(
            getMatchingTechniques({ ...defaultProperties, $zoom: 15 }, [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    minZoomLevel: 15,
                    maxZoomLevel: 15
                }
            ])
        );

        assert.isEmpty(
            getMatchingTechniques({ ...defaultProperties, $zoom: 15 }, [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    minZoomLevel: 16
                }
            ])
        );

        assert.isEmpty(
            getMatchingTechniques({ ...defaultProperties, $zoom: 15 }, [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    maxZoomLevel: 14
                }
            ])
        );
    });
});
