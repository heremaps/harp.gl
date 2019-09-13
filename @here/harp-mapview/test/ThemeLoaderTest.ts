/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as sinon from "sinon";

import {
    ResolvedStyleSet,
    SelectorValueDefinition,
    SolidLineStyle,
    StyleSelector,
    StyleSet,
    Theme
} from "@here/harp-datasource-protocol";
import { getTestResourceUrl } from "@here/harp-test-utils";
import { ContextLogger } from "@here/harp-utils";
import { ThemeLoader } from "../lib/ThemeLoader";

describe("ThemeLoader", function() {
    describe("#resolveStyleSet", function() {
        it("resolves ref expression in technique attr values", async function() {
            const theme: Theme = {
                definitions: {
                    roadColor: { type: "color", value: "#f00" }
                },
                styles: {
                    tilezen: [
                        {
                            description: "roads",
                            when: "kind == 'road",
                            technique: "solid-line",
                            attr: {
                                lineColor: ["ref", "roadColor"]
                            }
                        }
                    ]
                }
            };
            const contextLogger = new ContextLogger(console, "theme");
            const r = ThemeLoader.resolveStyleSet(
                theme.styles!.tilezen,
                theme.definitions,
                contextLogger
            );

            const roadStyle = r.find(s => s.description === "roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");
            const roadStyleCasted = (roadStyle as any) as SolidLineStyle;
            assert.equal(roadStyleCasted.attr!.lineColor, "#f00");
        });

        it("resolves ref expressions in Style", async function() {
            const theme: Theme = {
                definitions: {
                    roadColor: { type: "color", value: "#f00" },
                    roadCondition: { type: "selector", value: "kind == 'road'" },
                    roadStyle: {
                        description: "roads",
                        when: ["ref", "roadCondition"],
                        technique: "solid-line",
                        attr: {
                            lineColor: ["ref", "roadColor"]
                        }
                    }
                },
                styles: {
                    tilezen: [["ref", "roadStyle"]]
                }
            };
            const contextLogger = new ContextLogger(console, "test theme: ");
            const r = ThemeLoader.resolveStyleSet(
                theme.styles!.tilezen,
                theme.definitions,
                contextLogger
            );

            const roadStyle = r.find(s => s.description === "roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");
            const roadStyleCasted = (roadStyle as any) as (SolidLineStyle & StyleSelector);
            assert.equal(roadStyleCasted.description, "roads");
            assert.deepEqual(
                roadStyleCasted.when,
                (theme.definitions!.roadCondition as SelectorValueDefinition).value
            );
            assert.equal(roadStyleCasted.attr!.lineColor, "#f00");
        });

        it("resolves refs embedded in expressions", async function() {
            const theme: Theme = {
                definitions: {
                    roadColor: { type: "color", value: "#f00" },
                    roadCondition: { type: "selector", value: ["==", ["get", "kind"], "road"] },
                    dataColoredRoadStyle: {
                        description: "custom-roads",
                        when: ["all", ["ref", "roadCondition"], ["has", "color"]],
                        technique: "solid-line",
                        final: true,
                        attr: {
                            lineColor: ["ref", "roadColor"]
                        }
                    }
                },
                styles: {
                    tilezen: [["ref", "dataColoredRoadStyle"]]
                }
            };
            const contextLogger = new ContextLogger(console, "test theme: ");
            const r = ThemeLoader.resolveStyleSet(
                theme.styles!.tilezen,
                theme.definitions,
                contextLogger
            );
            const roadStyle = r.find(s => s.description === "custom-roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");

            const roadStyleCasted = (roadStyle as any) as (SolidLineStyle & StyleSelector);

            assert.deepEqual(roadStyleCasted.when, [
                "all",
                ["==", ["get", "kind"], "road"],
                ["has", "color"]
            ]);
            assert.deepEqual(roadStyleCasted.attr!.lineColor, "#f00");
        });
    });

    describe("#resolveBaseTheme", function() {
        it("properly loads inherited definitions", async function() {
            const baseTheme: Theme = {
                definitions: {
                    roadColor: { type: "color", value: "#f00" },
                    primaryRoadFillLineWidth: {
                        type: "number",
                        value: {
                            interpolation: "Linear",
                            zoomLevels: [8, 9, 10, 11, 12, 13, 14, 16, 18],
                            values: [650, 400, 220, 120, 65, 35, 27, 9, 7]
                        }
                    },
                    roadStyle: {
                        description: "roads",
                        technique: "solid-line",
                        when: "foo",
                        attr: {
                            lineWidth: ["ref", "primaryRoadFillLineWidth"],
                            lineColor: ["ref", "roadColor"]
                        }
                    }
                }
            };
            const inheritedTheme: Theme = {
                extends: baseTheme,
                definitions: {
                    roadColor: { type: "color", value: "#fff" }
                }
            };

            const result = await ThemeLoader.resolveBaseTheme(inheritedTheme);

            assert.exists(result.definitions);
            assert.exists(result.definitions!.roadColor);
            assert.exists(result.definitions!.roadStyle);
            assert.deepEqual(result.definitions!.roadColor, { type: "color", value: "#fff" });
            assert.deepEqual(result.definitions!.roadStyle, baseTheme.definitions!.roadStyle);
        });
    });

    describe("#load support for inheritance and optional reference resolving", function() {
        const baseThemeUrl = getTestResourceUrl(
            "@here/harp-mapview",
            "test/resources/baseTheme.json"
        );

        const expectedBaseStyleSet: StyleSet = [
            {
                description: "roads",
                when: "kind == 'road",
                technique: "solid-line",
                attr: {
                    lineWidth: {
                        interpolation: "Linear",
                        zoomLevels: [8, 9, 10, 11, 12, 13, 14, 16, 18],
                        values: [650, 400, 220, 120, 65, 35, 27, 9, 7]
                    },
                    lineColor: "#f00"
                }
            }
        ];

        const expectedOverridenStyleSet: StyleSet = [
            {
                description: "roads",
                when: "kind == 'road",
                technique: "solid-line",
                attr: {
                    lineWidth: {
                        interpolation: "Linear",
                        zoomLevels: [8, 9, 10, 11, 12, 13, 14, 16, 18],
                        values: [650, 400, 220, 120, 65, 35, 27, 9, 7]
                    },
                    lineColor: "#fff"
                }
            }
        ];
        it("loads theme from actual URL and resolves definitions", async function() {
            const result = await ThemeLoader.load(baseThemeUrl, { resolveDefinitions: true });
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedBaseStyleSet);
        });

        it("supports definitions override with actual files", async function() {
            const inheritedThemeUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/inheritedStyleBasic.json"
            );
            const result = await ThemeLoader.load(inheritedThemeUrl, { resolveDefinitions: true });
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedOverridenStyleSet);
        });

        it("empty inherited theme just loads base", async function() {
            const result = await ThemeLoader.load(
                { extends: baseThemeUrl },
                { resolveDefinitions: true }
            );
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedBaseStyleSet);
        });

        it("supports local definitions override", async function() {
            const result = await ThemeLoader.load(
                {
                    extends: baseThemeUrl,
                    definitions: {
                        roadColor: { type: "color", value: "#fff" }
                    }
                },
                { resolveDefinitions: true }
            );
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedOverridenStyleSet);
        });
    });

    describe("diagnostic messages in #load", function() {
        it("removes invalid references and warns", async function() {
            const loggerMock = {
                error: sinon.stub<[...any[]]>(),
                warn: sinon.stub<[...any[]]>(),
                info: sinon.stub<[...any[]]>()
            };
            const r = await ThemeLoader.load(
                {
                    url: "file://theme.json",
                    definitions: {
                        roadColor: { type: "color", value: "#fff" },
                        roadStyle: {
                            description: "roads",
                            technique: "solid-line",
                            when: "foo",
                            attr: {
                                lineColor: ["ref", "badRef"]
                            }
                        }
                    },
                    styles: {
                        tilezen: [["ref", "roadStyle"], ["ref", "badStyleRef"]]
                    }
                },
                { logger: loggerMock, resolveDefinitions: true }
            );

            // Check that invalid style was removed from SS
            const tilezenStyleSet: ResolvedStyleSet = r.styles!.tilezen as ResolvedStyleSet;
            assert.equal(tilezenStyleSet.length, 1);

            // Check that invalid attr was removed from `roadStyle`
            assert.isUndefined((tilezenStyleSet[0].attr! as any).lineColor);

            // Check that load procedure emitted proper diagnostic messages
            assert.isTrue(
                loggerMock.info.calledOnceWith("when processing Theme file://theme.json:")
            );
            assert.isTrue(
                loggerMock.warn.calledWith(
                    "definitions.roadStyle.attr.lineColor: invalid reference 'badRef' - not found"
                )
            );
            assert.isTrue(
                loggerMock.warn.calledWith(
                    "styles.tilezen[1]: invalid reference 'badStyleRef' - not found"
                )
            );
            assert.isTrue(loggerMock.warn.calledWith("styles.tilezen[1]: invalid style, ignored"));
        });
    });
});
