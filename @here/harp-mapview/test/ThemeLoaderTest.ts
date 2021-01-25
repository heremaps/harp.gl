/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { FlatTheme, SolidLineStyle, StyleSet, Theme } from "@here/harp-datasource-protocol";
import { getTestResourceUrl } from "@here/harp-test-utils";
import {
    cloneDeep,
    ContextLogger,
    getAppBaseUrl,
    resolveReferenceUri,
    UriResolver
} from "@here/harp-utils";
import { assert } from "chai";

import { ThemeLoader } from "../lib/ThemeLoader";

describe("ThemeLoader", function () {
    describe("#isThemeLoaded", function () {
        it("checks for external dependencies", function () {
            assert.isFalse(
                ThemeLoader.isThemeLoaded({
                    extends: ["base_theme.json"]
                })
            );
            assert.isFalse(
                ThemeLoader.isThemeLoaded({
                    extends: "base_theme.json"
                })
            );
            assert.isTrue(ThemeLoader.isThemeLoaded({}));
        });
    });

    describe("#load url handling", function () {
        const appBaseUrl = getAppBaseUrl();
        const sampleThemeUrl = getTestResourceUrl(
            "@here/harp-mapview",
            "test/resources/baseTheme.json"
        );

        it("resolves absolute url of theme passed as object", async function () {
            const result = await ThemeLoader.load({});
            assert.equal(result.url, appBaseUrl);
        });

        it("resolves absolute theme url of theme loaded from relative url", async function () {
            const result = await ThemeLoader.load(sampleThemeUrl);
            assert.equal(result.url, resolveReferenceUri(appBaseUrl, sampleThemeUrl));
        });

        it("resolves absolute url of theme loaded from relative url", async function () {
            const result = await ThemeLoader.load(sampleThemeUrl);
            assert.equal(result.url, resolveReferenceUri(appBaseUrl, sampleThemeUrl));
        });

        it("resolves urls of resources embedded in theme", async function () {
            const absoluteSampleThemeUrl = resolveReferenceUri(appBaseUrl, sampleThemeUrl);

            const result = await ThemeLoader.load(absoluteSampleThemeUrl);
            assert.equal(result.url, absoluteSampleThemeUrl);

            const expectedFontCatalogUrl = resolveReferenceUri(
                absoluteSampleThemeUrl,
                "fonts/Default_FontCatalog.json"
            );
            assert.exists(result.fontCatalogs);
            assert.exists(result.fontCatalogs![0]);
            assert.equal(result.fontCatalogs![0].url, expectedFontCatalogUrl);
        });

        it("doesn't break if called on already #load-ed theme", async function () {
            const firstLoadResult = await ThemeLoader.load(sampleThemeUrl);
            const firstResultCopy = cloneDeep(firstLoadResult);
            const secondLoadResult = await ThemeLoader.load(firstLoadResult);

            assert.deepEqual(firstResultCopy, secondLoadResult);
        });

        it("obeys `uriResolver` option", async function () {
            // new PrefixMapUriResolver({
            //     "fonts://fira": "ACTUAL_FONT_LOCATION",
            //     "icons://": "ACTUAL_ICONS_LOCATION"
            // });
            const uriResolver: UriResolver = {
                resolveUri(uri) {
                    return uri.replace("://", "://resolved!");
                }
            };
            const r = await ThemeLoader.load(
                {
                    fontCatalogs: [
                        {
                            url: "fonts://fira",
                            name: "fira"
                        }
                    ],
                    images: {
                        icons_day_maki: {
                            url: "icons://maki_icons.png",
                            preload: true,
                            atlas: "icons://icons/maki_icons.json"
                        }
                    }
                },
                {
                    uriResolver
                }
            );

            assert.equal(r.fontCatalogs![0].url, "fonts://resolved!fira");
            assert.equal(r.images!.icons_day_maki.url, "icons://resolved!maki_icons.png");
            assert.equal(r.images!.icons_day_maki.atlas, "icons://resolved!icons/maki_icons.json");
        });
    });
    describe("#resolveStyleSet", function () {
        it("resolves ref expression in technique attr values", async function () {
            const theme: Theme = {
                definitions: {
                    roadColor: { value: "#f00" },
                    roadWidth: { type: "number", value: 123 },
                    roadOutlineWidth: { value: 33 }
                },
                styles: {
                    tilezen: [
                        {
                            description: "roads",
                            when: "kind == 'road",
                            technique: "solid-line",
                            attr: {
                                lineColor: ["ref", "roadColor"],
                                lineWidth: ["ref", "roadWidth"],
                                outlineWidth: ["ref", "roadOutlineWidth"]
                            }
                        }
                    ]
                }
            };
            const contextLogger = new ContextLogger(console, "theme");

            // Hack to access private members with type safety
            const r = ThemeLoader["resolveStyleSet"](
                theme.styles!.tilezen,
                theme.definitions,
                contextLogger
            );

            const roadStyle = r.find(s => s.description === "roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");
            const roadStyleCasted = (roadStyle as any) as SolidLineStyle;
            assert.equal(roadStyleCasted.attr?.lineColor, "#f00");
            assert.equal(roadStyleCasted.attr?.lineWidth, 123);
            assert.equal(roadStyleCasted.attr?.outlineWidth, 33);
        });

        it("resolves ref expressions in Style", async function () {
            const theme: Theme = {
                definitions: {
                    roadColor: { type: "color", value: "#f00" },
                    roadCondition: { type: "selector", value: "kind == 'road'" }
                },
                styles: {
                    tilezen: [
                        {
                            description: "roads",
                            when: ["ref", "roadCondition"],
                            technique: "solid-line",
                            attr: {
                                lineColor: ["ref", "roadColor"]
                            }
                        }
                    ]
                }
            };
            const contextLogger = new ContextLogger(console, "test theme: ");
            // Hack to access private members with type safety
            const r = ThemeLoader["resolveStyleSet"](
                theme.styles!.tilezen,
                theme.definitions,
                contextLogger
            );

            const roadStyle = r.find(s => s.description === "roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");
            const roadStyleCasted = (roadStyle as any) as SolidLineStyle;
            assert.equal(roadStyleCasted.description, "roads");
            assert.deepEqual(roadStyleCasted.when!, theme.definitions!.roadCondition.value);
            assert.equal(roadStyleCasted.attr!.lineColor, "#f00");
        });

        it("resolves refs embedded in expressions", async function () {
            const theme: Theme = {
                definitions: {
                    roadColor: { type: "color", value: "#f00" },
                    roadCondition: { type: "selector", value: ["==", ["get", "kind"], "road"] }
                },
                styles: {
                    tilezen: [
                        {
                            description: "custom-roads",
                            when: ["all", ["ref", "roadCondition"], ["has", "color"]],
                            technique: "solid-line",
                            final: true,
                            attr: {
                                lineColor: ["ref", "roadColor"]
                            }
                        }
                    ]
                }
            };
            const contextLogger = new ContextLogger(console, "test theme: ");
            // Hack to access private members with type safety
            const r = ThemeLoader["resolveStyleSet"](
                theme.styles!.tilezen,
                theme.definitions,
                contextLogger
            );
            const roadStyle = r.find(s => s.description === "custom-roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");

            const roadStyleCasted = (roadStyle as any) as SolidLineStyle;

            assert.deepEqual(roadStyleCasted.when, [
                "all",
                ["==", ["get", "kind"], "road"],
                ["has", "color"]
            ]);
            assert.deepEqual(roadStyleCasted.attr!.lineColor, "#f00");
        });
    });

    describe("#resolveBaseTheme", function () {
        const baseThemeRoads: Theme = {
            definitions: {
                roadColor: { type: "color", value: "#f00" },
                primaryRoadFillLineWidth: {
                    type: "number",
                    value: {
                        interpolation: "Linear",
                        zoomLevels: [8, 9, 10, 11, 12, 13, 14, 16, 18],
                        values: [650, 400, 220, 120, 65, 35, 27, 9, 7]
                    }
                }
            },
            styles: {
                tilezen: [
                    {
                        description: "roads",
                        technique: "solid-line",
                        when: "foo",
                        lineWidth: ["ref", "primaryRoadFillLineWidth"],
                        lineColor: ["ref", "roadColor"]
                    }
                ]
            }
        };

        const baseThemeWater: Theme = {
            definitions: {
                waterColor: { type: "color", value: "#44f" }
            }
        };
        it("supports single inheritance", async function () {
            const inheritedTheme: Theme = {
                extends: baseThemeRoads,
                definitions: {
                    roadColor: { type: "color", value: "#fff" }
                }
            };

            // Hack to access private members with type safety
            const result = await ThemeLoader["resolveBaseThemes"](inheritedTheme);

            assert.exists(result.definitions);
            assert.exists(result.definitions!.roadColor);
            assert.deepEqual(result.definitions!.roadColor, { type: "color", value: "#fff" });
        });
        it("supports multiple inheritance", async function () {
            const inheritedTheme: Theme = {
                extends: [
                    baseThemeRoads,
                    baseThemeWater,
                    {
                        definitions: {
                            waterColor: { type: "color", value: "#0f0" }
                        }
                    }
                ],
                definitions: {
                    roadColor: { type: "color", value: "#fff" }
                }
            };

            // Hack to access private members with type safety
            const result = await ThemeLoader["resolveBaseThemes"](inheritedTheme);

            assert.exists(result.definitions);
            assert.exists(result.definitions!.roadColor);
            assert.deepEqual(result.definitions!.roadColor, { type: "color", value: "#fff" });
            assert.deepEqual(result.definitions!.waterColor, { type: "color", value: "#0f0" });
        });
    });

    describe("#load support for inheritance and optional reference resolving", function () {
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
        it("loads theme from actual URL and resolves definitions", async function () {
            const result = await ThemeLoader.load(baseThemeUrl, { resolveDefinitions: true });
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedBaseStyleSet);
        });

        it("supports definitions override with actual files", async function () {
            const inheritedThemeUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/inheritedStyleBasic.json"
            );
            const result = await ThemeLoader.load(inheritedThemeUrl, { resolveDefinitions: true });
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedOverridenStyleSet);
        });

        it("empty inherited theme just loads base", async function () {
            const result = await ThemeLoader.load(
                { extends: baseThemeUrl },
                { resolveDefinitions: true }
            );
            assert.exists(result);
            assert.exists(result.styles!.tilezen);
            assert.deepEqual(result.styles!.tilezen, expectedBaseStyleSet);
        });

        it("supports local definitions override", async function () {
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

    describe("flat themes", function () {
        it("load flat theme", async () => {
            const flatTheme: FlatTheme = {
                styles: [
                    {
                        styleSet: "tilezen",
                        when: ["boolean", true],
                        technique: "none"
                    },
                    {
                        styleSet: "terrain",
                        when: ["boolean", false],
                        technique: "none"
                    },
                    {
                        styleSet: "tilezen",
                        when: ["boolean", false],
                        technique: "solid-line",
                        attr: {
                            lineWidth: 2
                        }
                    }
                ]
            };

            const theme = await ThemeLoader.load(flatTheme);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles!.tilezen);
            const tilezen = theme.styles!.tilezen;
            assert.strictEqual(tilezen.length, 2);
            assert.strictEqual(tilezen[0].technique, "none");
            assert.strictEqual(tilezen[1].technique, "solid-line");

            assert.isArray(theme.styles!.terrain);
            const terrain = theme.styles!.terrain;
            assert.strictEqual(terrain.length, 1);
            assert.strictEqual(terrain[0].technique, "none");
        });
    });

    describe("merge style sets", function () {
        it("merge themes", async () => {
            const baseTheme: Theme = {
                styles: {
                    tilezen: [
                        {
                            when: ["boolean", true],
                            technique: "none"
                        }
                    ],
                    terrain: [
                        {
                            when: ["boolean", false],
                            technique: "none"
                        }
                    ]
                }
            };

            const source: Theme = {
                extends: [baseTheme],
                styles: {
                    tilezen: [
                        {
                            when: ["boolean", false],
                            technique: "solid-line",
                            attr: {
                                lineWidth: 2
                            }
                        }
                    ]
                }
            };

            const theme = await ThemeLoader.load(source);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles!.tilezen);
            const tilezen = theme.styles!.tilezen;
            assert.strictEqual(tilezen.length, 2);
            assert.strictEqual(tilezen[0].technique, "none");
            assert.strictEqual(tilezen[1].technique, "solid-line");

            assert.isArray(theme.styles!.terrain);
            const terrain = theme.styles!.terrain;
            assert.strictEqual(terrain.length, 1);
            assert.strictEqual(terrain[0].technique, "none");
        });

        it("merge flat themes", async () => {
            const baseTheme: FlatTheme = {
                styles: [
                    {
                        styleSet: "tilezen",
                        when: ["boolean", true],
                        technique: "none"
                    },
                    {
                        styleSet: "terrain",
                        when: ["boolean", false],
                        technique: "none"
                    }
                ]
            };

            const source: FlatTheme = {
                extends: [(baseTheme as unknown) as Theme],
                styles: [
                    {
                        styleSet: "tilezen",
                        when: ["boolean", false],
                        technique: "solid-line",
                        attr: {
                            lineWidth: 2
                        }
                    }
                ]
            };

            const theme = await ThemeLoader.load(source);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles!.tilezen);
            const tilezen = theme.styles!.tilezen;
            assert.strictEqual(tilezen.length, 2);
            assert.strictEqual(tilezen[0].technique, "none");
            assert.strictEqual(tilezen[1].technique, "solid-line");

            assert.isArray(theme.styles!.terrain);
            const terrain = theme.styles!.terrain;
            assert.strictEqual(terrain.length, 1);
            assert.strictEqual(terrain[0].technique, "none");
        });

        it("extends existing style", async () => {
            const baseTheme: FlatTheme = {
                styles: [
                    {
                        styleSet: "tilezen",
                        id: "buildings",

                        layer: "buildings",
                        when: ["==", ["geometry-type"], "Polygon"],
                        technique: "extruded-polygon",
                        color: "#f00"
                    },
                    {
                        styleSet: "terrain",

                        when: ["boolean", false],
                        technique: "none"
                    }
                ]
            };

            const source: FlatTheme = {
                extends: [(baseTheme as unknown) as Theme],
                styles: [
                    {
                        styleSet: "tilezen",

                        // extends the extisting style with this id
                        extends: "buildings",

                        technique: "extruded-polygon",
                        color: "#0f0",
                        lineColor: "#00f"
                    }
                ]
            };

            const theme = await ThemeLoader.load(source);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles!.tilezen);

            const tilezen = theme.styles!.tilezen;
            assert.strictEqual(tilezen.length, 1);
            assert.strictEqual(tilezen[0].technique, "extruded-polygon");

            assert.deepEqual(tilezen[0], {
                styleSet: "tilezen",
                id: "buildings",
                extends: undefined,

                layer: "buildings",
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                color: "#0f0",
                lineColor: "#00f"
            });

            assert.isArray(theme.styles!.terrain);
            const terrain = theme.styles!.terrain;
            assert.strictEqual(terrain.length, 1);
            assert.strictEqual(terrain[0].technique, "none");
        });

        it("overrides property of an existing sytle", async () => {
            const baseTheme: FlatTheme = {
                styles: [
                    {
                        styleSet: "tilezen",
                        id: "buildings",

                        layer: "buildings",
                        when: ["==", ["geometry-type"], "Polygon"],
                        technique: "extruded-polygon",
                        color: "#f00"
                    },
                    {
                        styleSet: "terrain",
                        when: ["boolean", false],
                        technique: "none"
                    }
                ]
            };

            const source: FlatTheme = {
                extends: [(baseTheme as unknown) as Theme],
                styles: [
                    {
                        styleSet: "tilezen",

                        // overrides the extisting style with this id
                        id: "buildings",

                        layer: "buildings",
                        when: ["==", ["geometry-type"], "Polygon"],
                        technique: "fill"
                    }
                ]
            };

            const theme = await ThemeLoader.load(source);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles!.tilezen);

            const tilezen = theme.styles!.tilezen;
            assert.strictEqual(tilezen.length, 1);

            assert.deepEqual(tilezen[0], {
                styleSet: "tilezen",
                id: "buildings",

                layer: "buildings",
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill"
            });

            assert.isArray(theme.styles!.terrain);
            const terrain = theme.styles!.terrain;
            assert.strictEqual(terrain.length, 1);
            assert.strictEqual(terrain[0].technique, "none");
        });

        it("verify the scope of ids", async () => {
            // the two style sets have a rule with the same id.
            const baseTheme: FlatTheme = {
                styles: [
                    {
                        styleSet: "tilezen",
                        id: "rule-id",

                        layer: "buildings",
                        when: ["==", ["geometry-type"], "Polygon"],
                        technique: "extruded-polygon",
                        color: "#f00"
                    },
                    {
                        styleSet: "terrain",
                        id: "rule-id",

                        when: ["boolean", false],
                        technique: "none"
                    }
                ]
            };

            // the extension overrides only the rule from the
            // referenced id of the styleset `tilezen`, and leaves
            // the styleset `terrain` unmodified.

            const source: FlatTheme = {
                extends: [(baseTheme as unknown) as Theme],
                styles: [
                    {
                        styleSet: "tilezen",

                        // extends the extisting style with this id
                        extends: "rule-id",

                        technique: "extruded-polygon",
                        color: "#0f0",
                        lineColor: "#00f"
                    }
                ]
            };

            const theme = await ThemeLoader.load(source);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles!.tilezen);

            const tilezen = theme.styles!.tilezen;
            assert.strictEqual(tilezen.length, 1);

            assert.deepEqual(tilezen[0], {
                styleSet: "tilezen",
                id: "rule-id",
                extends: undefined,

                layer: "buildings",
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                color: "#0f0",
                lineColor: "#00f"
            });

            const terrain = theme.styles!.terrain;
            assert.strictEqual(terrain.length, 1);

            assert.deepEqual(terrain[0], {
                styleSet: "terrain",
                id: "rule-id",

                when: ["boolean", false],
                technique: "none"
            });
        });
    });
});
