/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { getStyles, SolidLineStyle, Styles, Theme } from "@here/harp-datasource-protocol";
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
            assert.equal(result.url, sampleThemeUrl);
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
                    roadColor: "#f00",
                    roadWidth: 123,
                    roadOutlineWidth: 33
                },
                styles: [
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
            };
            const contextLogger = new ContextLogger(console, "theme");

            // Hack to access private members with type safety
            const r = ThemeLoader["resolveStyles"](
                getStyles(theme.styles),
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
                    roadColor: "#f00",
                    roadCondition: "kind == 'road'"
                },
                styles: [
                    {
                        description: "roads",
                        when: ["ref", "roadCondition"],
                        technique: "solid-line",
                        attr: {
                            lineColor: ["ref", "roadColor"]
                        }
                    }
                ]
            };
            const contextLogger = new ContextLogger(console, "test theme: ");
            // Hack to access private members with type safety
            const r = ThemeLoader["resolveStyles"](
                getStyles(theme.styles),
                theme.definitions,
                contextLogger
            );

            const roadStyle = r.find(s => s.description === "roads")!;
            assert.exists(roadStyle);
            assert.equal(roadStyle.technique, "solid-line");
            const roadStyleCasted = (roadStyle as any) as SolidLineStyle;
            assert.equal(roadStyleCasted.description, "roads");
            assert.deepEqual(roadStyleCasted.when!, theme.definitions!.roadCondition);
            assert.equal(roadStyleCasted.attr!.lineColor, "#f00");
        });

        it("resolves refs embedded in expressions", async function () {
            const theme: Theme = {
                definitions: {
                    roadColor: "#f00",
                    roadCondition: ["==", ["get", "kind"], "road"]
                },

                styles: [
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
            };
            const contextLogger = new ContextLogger(console, "test theme: ");
            // Hack to access private members with type safety
            const r = ThemeLoader["resolveStyles"](
                getStyles(theme.styles),
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
                roadColor: "#f00",
                primaryRoadFillLineWidth: {
                    interpolation: "Linear",
                    zoomLevels: [8, 9, 10, 11, 12, 13, 14, 16, 18],
                    values: [650, 400, 220, 120, 65, 35, 27, 9, 7]
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
                waterColor: "#44f"
            }
        };
        it("supports single inheritance", async function () {
            const inheritedTheme: Theme = {
                extends: baseThemeRoads,
                definitions: {
                    roadColor: "#fff"
                }
            };

            // Hack to access private members with type safety
            const result = await ThemeLoader["resolveBaseThemes"](inheritedTheme);

            assert.exists(result.definitions);
            assert.exists(result.definitions!.roadColor);
            assert.deepEqual(result.definitions!.roadColor, "#fff");
        });
        it("supports multiple inheritance", async function () {
            const inheritedTheme: Theme = {
                extends: [
                    baseThemeRoads,
                    baseThemeWater,
                    {
                        definitions: {
                            waterColor: "#0f0"
                        }
                    }
                ],
                definitions: {
                    roadColor: "#fff"
                }
            };

            // Hack to access private members with type safety
            const result = await ThemeLoader["resolveBaseThemes"](inheritedTheme);

            assert.exists(result.definitions);
            assert.exists(result.definitions!.roadColor);
            assert.equal(result.definitions!.roadColor, "#fff");
            assert.equal(result.definitions!.waterColor, "#0f0");
        });
        it("supports multiple inheritance with textures", async function () {
            const inheritedTheme: Theme = {
                extends: [
                    {
                        images: {
                            foo: {
                                url: "icons://maki_icons.png",
                                preload: true
                            },
                            baz: {
                                url: "icons://maki_icons.png",
                                preload: true
                            }
                        },
                        imageTextures: [
                            {
                                name: "foo",
                                image: "foo"
                            },
                            {
                                name: "baz",
                                image: "baz"
                            }
                        ]
                    },
                    {
                        images: {
                            bar: {
                                url: "icons://maki_icons.png",
                                preload: true
                            },
                            baz: {
                                url: "icons://override.png",
                                atlas: "icons://icons/maki_icons.json",
                                preload: true
                            }
                        },
                        imageTextures: [
                            {
                                name: "bar",
                                image: "bar"
                            },
                            {
                                name: "baz",
                                image: "baz"
                            }
                        ]
                    }
                ]
            };

            const result = await ThemeLoader.load(inheritedTheme);
            assert.exists(result.images?.foo);
            assert.exists(result.images?.bar);
            assert.exists(result.images?.baz);

            assert.equal(result.images?.baz.url, "icons://override.png");
            assert.exists(result.images?.baz.atlas);

            assert.deepEqual(result.imageTextures?.map(imageTexture => imageTexture.name).sort(), [
                "bar",
                "baz",
                "foo"
            ]);
        });
    });

    describe("#load support for inheritance and optional reference resolving", function () {
        const baseThemeUrl = getTestResourceUrl(
            "@here/harp-mapview",
            "test/resources/baseTheme.json"
        );

        const expectedBaseStyleSet: Styles = [
            {
                description: "roads",
                when: "kind == 'road",
                technique: "solid-line",
                styleSet: "tilezen",
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

        const expectedOverridenStyleSet: Styles = [
            {
                description: "roads",
                when: "kind == 'road",
                technique: "solid-line",
                styleSet: "tilezen",
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
            assert.exists(result.styles);
            assert.deepEqual(result.styles, expectedBaseStyleSet);
        });

        it("supports definitions override with actual files", async function () {
            const inheritedThemeUrl = getTestResourceUrl(
                "@here/harp-mapview",
                "test/resources/inheritedStyleBasic.json"
            );
            const result = await ThemeLoader.load(inheritedThemeUrl, { resolveDefinitions: true });
            assert.exists(result);
            assert.exists(result.styles);
            assert.equal(result.styles?.length, 1);
            assert.deepEqual(result.styles, expectedOverridenStyleSet);
        });

        it("empty inherited theme just loads base", async function () {
            const result = await ThemeLoader.load(
                { extends: baseThemeUrl },
                { resolveDefinitions: true }
            );
            assert.exists(result);
            assert.exists(result.styles);
            assert.deepEqual(result.styles, expectedBaseStyleSet);
        });

        it("supports local definitions override", async function () {
            const result = await ThemeLoader.load(
                {
                    extends: baseThemeUrl,
                    definitions: {
                        roadColor: "#fff"
                    }
                },
                { resolveDefinitions: true }
            );
            assert.exists(result);
            assert.exists(result.styles);
            assert.deepEqual(result.styles!, expectedOverridenStyleSet);
        });
    });

    describe("old styles themes", function () {
        it("load old styles theme", async () => {
            const stylesDictionaryTheme: Theme = {
                styles: {
                    tilezen: [
                        {
                            when: ["boolean", true],
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
                    ],
                    terrain: [
                        {
                            styleSet: "terrain",
                            when: ["boolean", false],
                            technique: "none"
                        }
                    ]
                }
            };

            const theme = await ThemeLoader.load(stylesDictionaryTheme);

            assert.isDefined(theme.styles);
            assert.isArray(theme.styles);
            theme.styles = getStyles(theme.styles);
            assert.strictEqual(theme.styles!.length, 3);
            assert.strictEqual(theme.styles[0].styleSet, "tilezen");
            assert.strictEqual(theme.styles[1].styleSet, "tilezen");
            assert.strictEqual(theme.styles[2].styleSet, "terrain");
        });
    });

    describe("merge style sets", function () {
        it("merge themes", async () => {
            const baseTheme: Theme = {
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
            assert.isArray(theme.styles);
            theme.styles = getStyles(theme.styles);
            assert.strictEqual(theme.styles.length, 3);
            assert.strictEqual(theme.styles[0].styleSet, "tilezen");
            assert.strictEqual(theme.styles[1].styleSet, "terrain");
            assert.strictEqual(theme.styles[2].styleSet, "tilezen");
        });

        it("merge flat themes", async () => {
            const baseTheme: Theme = {
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

            const source: Theme = {
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
            assert.isArray(theme.styles);
            theme.styles = getStyles(theme.styles);
            assert.strictEqual(theme.styles.length, 3);
            assert.strictEqual(theme.styles[0].styleSet, "tilezen");
            assert.strictEqual(theme.styles[1].styleSet, "terrain");
            assert.strictEqual(theme.styles[2].styleSet, "tilezen");
        });

        it("extends existing style", async () => {
            const baseTheme: Theme = {
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

            const source: Theme = {
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
            assert.isArray(theme.styles!);
            theme.styles = getStyles(theme.styles);

            const tilezenStyle = theme.styles[0];
            assert.strictEqual(tilezenStyle.technique, "extruded-polygon");

            assert.deepEqual(tilezenStyle, {
                styleSet: "tilezen",
                id: "buildings",
                extends: undefined,

                layer: "buildings",
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                color: "#0f0",
                lineColor: "#00f"
            });

            const terrainStyle = theme.styles[1];
            assert.strictEqual(terrainStyle.technique, "none");
        });

        it("overrides property of an existing style", async () => {
            const baseTheme: Theme = {
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

            const source: Theme = {
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
            assert.isArray(theme.styles!);
            theme.styles = getStyles(theme.styles);

            const tilezenStyle = theme.styles[0];

            assert.deepEqual(tilezenStyle, {
                styleSet: "tilezen",
                id: "buildings",

                layer: "buildings",
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "fill"
            });

            const terrainStyle = theme.styles[1];
            assert.strictEqual(terrainStyle.technique, "none");
        });

        it("verify the scope of ids", async () => {
            // the two style sets have a rule with the same id.
            const baseTheme: Theme = {
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

            const source: Theme = {
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
            assert.isArray(theme.styles!);

            theme.styles = getStyles(theme.styles);
            const tilezenStyle = theme.styles[0];
            assert.strictEqual(tilezenStyle.technique, "extruded-polygon");

            assert.deepEqual(tilezenStyle, {
                styleSet: "tilezen",
                id: "rule-id",
                extends: undefined,

                layer: "buildings",
                when: ["==", ["geometry-type"], "Polygon"],
                technique: "extruded-polygon",
                color: "#0f0",
                lineColor: "#00f"
            });

            const terrainStyle = theme.styles[1];
            assert.deepEqual(terrainStyle, {
                styleSet: "terrain",
                id: "rule-id",

                when: ["boolean", false],
                technique: "none"
            });
        });
    });
});
