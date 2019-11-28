/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";
import * as path from "path";
import * as sinon from "sinon";

import * as nodeUrl from "url";

const URL = typeof window !== "undefined" ? window.URL : nodeUrl.URL;

import {
    ResolvedStyleSet,
    SelectorValueDefinition,
    SolidLineStyle,
    StyleSelector,
    StyleSet,
    Theme
} from "@here/harp-datasource-protocol";
import { getTestResourceUrl } from "@here/harp-test-utils";
import {
    cloneDeep,
    ContextLogger,
    getAppBaseUrl,
    resolveReferenceUri,
    UriResolver
} from "@here/harp-utils";
import { ThemeLoader } from "../lib/ThemeLoader";

function makeUrlRelative(baseUrl: string, url: string) {
    const baseUrlParsed = new URL(baseUrl);
    const urlParsed = new URL(url, baseUrl);

    if (urlParsed.origin !== baseUrlParsed.origin) {
        throw new Error("getRelativeUrl: origin mismatch");
    }
    if (urlParsed.protocol !== baseUrlParsed.protocol) {
        throw new Error("getRelativeUrl: protocol mismatch");
    }
    return path.relative(baseUrlParsed.pathname, urlParsed.pathname);
}

describe("ThemeLoader", function() {
    describe("#load url handling", function() {
        const appBaseUrl = getAppBaseUrl();
        const sampleThemeUrl = getTestResourceUrl(
            "@here/harp-mapview",
            "test/resources/baseTheme.json"
        );

        it("resolves absolute url of theme passed as object", async function() {
            const result = await ThemeLoader.load({});
            assert.equal(result.url, appBaseUrl);
        });

        it("resolves absolute theme url of theme loaded from relative url", async function() {
            // `sampleThemeUrl` may be absolute, but on same host (or fs), so relativize it
            const relativeToAppUrl = makeUrlRelative(appBaseUrl, sampleThemeUrl);

            const result = await ThemeLoader.load(relativeToAppUrl);
            assert.equal(result.url, resolveReferenceUri(appBaseUrl, relativeToAppUrl));
        });

        it("resolves absolute url of theme loaded from relative url", async function() {
            // `sampleThemeUrl` may be absolute, but on same host (or fs), so relativize it
            const relativeToAppUrl = makeUrlRelative(appBaseUrl, sampleThemeUrl);

            const result = await ThemeLoader.load(relativeToAppUrl);
            assert.equal(result.url, resolveReferenceUri(appBaseUrl, relativeToAppUrl));
        });

        it("resolves urls of resources embedded in theme", async function() {
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

        it("doesn't break if called on already #load-ed theme", async function() {
            const relativeToAppUrl = makeUrlRelative(appBaseUrl, sampleThemeUrl);

            const firstLoadResult = await ThemeLoader.load(relativeToAppUrl);
            const firstResultCopy = cloneDeep(firstLoadResult);
            const secondLoadResult = await ThemeLoader.load(firstLoadResult);

            assert.deepEqual(firstResultCopy, secondLoadResult);
        });

        it("obeys `uriResolver` option", async function() {
            // new PrefixMapUriResolver({
            //     "fonts://fira": "ACTUAL_FONT_LOCATION",
            //     "icons://": "ACTUAL_ICONS_LOCATION"
            // });
            const uriResolver: UriResolver = {
                resolveUri(uri) {
                    return "resolved!" + uri;
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

            assert.equal(r.fontCatalogs![0].url, "resolved!fonts://fira");
            assert.equal(r.images!.icons_day_maki.url, "resolved!icons://maki_icons.png");
            assert.equal(r.images!.icons_day_maki.atlas, "resolved!icons://icons/maki_icons.json");
        });
    });
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
