/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import { MapEnv } from "../lib/Expr";
import { createInterpolatedProperty } from "../lib/InterpolatedProperty";
import { InterpolatedPropertyDefinition } from "../lib/InterpolatedPropertyDefs";
import { StyleSetEvaluator } from "../lib/StyleSetEvaluator";
import { FillTechnique, isSolidLineTechnique, SolidLineTechnique } from "../lib/Techniques";
import { Definitions, StyleDeclaration, StyleSet } from "../lib/Theme";

import { measureThroughputSync } from "@here/harp-test-utils";

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

    it("supports renderOrderGroups", function() {
        const styleSetWithRenderOrderBiasGroups: StyleSet = [
            {
                description: "first",
                technique: "fill",
                renderOrderBiasGroup: "bar",
                renderOrderBiasRange: [0, 1000],
                when: "kind == 'bar'",
                attr: { color: "yellow" }
            },
            {
                description: "second",
                technique: "fill",
                renderOrderBiasGroup: "park",
                renderOrderBiasRange: [0, 100],
                when: "kind == 'park'",
                attr: { color: "green" }
            }
        ];
        const ev = new StyleSetEvaluator(styleSetWithRenderOrderBiasGroups);

        const parsedStyles = ev.styleSet;
        assert.equal(parsedStyles[0].renderOrder, 0);
        assert.equal(parsedStyles[1].renderOrder, 1001);
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
    });

    describe("#performance", function() {
        /**
         * This test checks that rule "at end" of styleset, is matched with more or less the same
         * speed that rule "at beginning" of styleset because, SSE is expected to
         * prefilter processed ruleset by "layer/geometryType" as most of expressions contain these.
         */
        describe("#getMatchingTechniques", function() {
            let sampleStyleSet: StyleSet;
            before(async () => {
                sampleStyleSet = [];
                for (const layer of ["roads", "transit", "water", "earth", "poi", "landuse"]) {
                    for (const geometryType of ["polygon", "line", "point"]) {
                        for (const kind of ["foo", "bar", "baz", "spam", "eggs"]) {
                            sampleStyleSet.push({
                                when: [
                                    "all",
                                    ["==", ["get", "$layer"], layer],
                                    ["==", ["get", "$geometryType"], geometryType],
                                    ["==", ["get", "kind"], kind]
                                ],
                                technique: "extruded-polygon",
                                attr: {
                                    height: 100
                                }
                            });
                        }
                    }
                }
            });
            const myRule: StyleDeclaration = {
                when: [
                    "all",
                    ["==", ["get", "$layer"], "buildings"],
                    ["==", ["get", "$geometryType"], "polygon"]
                ],
                technique: "extruded-polygon",
                attr: {
                    height: 100
                },
                final: true
            };
            const env = new MapEnv({
                $layer: "buildings",
                $level: 14,
                $geometryType: "polygon",
                id: 1234567,
                height: 33
            });

            it("getMatchingTechniques x1000 - rule at start", function() {
                this.timeout(2000);
                const sse = new StyleSetEvaluator([myRule, ...sampleStyleSet]);

                measureThroughputSync("StyleSetEvaluator#getMatchingTechniques-begin", 500, () => {
                    for (let i = 0; i < 1000; i++) {
                        sse.getMatchingTechniques(env, "buildings");
                        // don't know why asserts are so sloooow!
                        //assert.strictEqual(t.length, 1);
                        //assert.strictEqual(t[0].name, "extruded-polygon");
                    }
                });
            });
            it("getMatchingTechniques x1000 speed - rule at end", function() {
                this.timeout(2000);
                const sse = new StyleSetEvaluator([...sampleStyleSet, myRule]);
                measureThroughputSync("StyleSetEvaluator#getMatchingTechniques-end", 500, () => {
                    for (let i = 0; i < 1000; i++) {
                        sse.getMatchingTechniques(env, "buildings");
                        // don't know why asserts are so sloooow!
                        //assert.strictEqual(t.length, 1);
                        //assert.strictEqual(t[0].name, "extruded-polygon");
                    }
                });
            });
        });
    });
});
