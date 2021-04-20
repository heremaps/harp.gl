/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const { options } = require("./karma.options");

/**
 * @param {import("karma").Config} config
 */
("use.strict");
module.exports = function (config) {
    const reports = config.coverage
        ? {
              html: "coverage",
              "text-summary": ""
          }
        : {};

    config.set({
        ...options,

        // This tells karma which plugins to pull in.
        frameworks: ["mocha", "karma-typescript"],

        files: [
            // List of files / patterns to load in the browser these files minus the ones specified
            // in the `exclude` property and where `included` isn't false. This dictates the code we
            // are to check its coverage. Note, the tests themselves don't count to code coverage and
            // are excluded using the karmaTypescriptConfig.coverage.exclude property.
            "@here/harp-datasource-protocol/**/*.ts",
            "@here/harp-debug-datasource/**/*.ts",
            "@here/harp-geometry/**/*.ts",
            "@here/harp-fetch/**/*.ts",
            "@here/harp-utils/**/*.ts",
            "@here/harp-geoutils/**/*.ts",
            "@here/harp-mapview/**/*.ts",
            "@here/harp-mapview-decoder/**/*.ts",
            "@here/harp-materials/**/*.ts",
            "@here/harp-text-canvas/**/*.ts",
            "@here/harp-lrucache/**/*.ts",
            "@here/harp-transfer-manager/**/*.ts",
            "@here/harp-lines/**/*.ts",
            "@here/harp-test-utils/**/*.ts",
            "@here/harp-map-controls/**/*.ts",
            "@here/harp-olp-utils/**/*.ts",
            "@here/harp-webtile-datasource/**/*.ts",
            // Resources here are fetched by URL, note these require the correct proxy to be setup
            // see "proxies" below.
            {
                pattern: "@here/harp-test-utils/test/resources/*.*",
                included: false
            },
            {
                pattern: "node_modules/@here/harp-fontcatalog/resources/**/*.*",
                included: false
            },
            {
                pattern: "@here/harp-mapview/test/resources/*.*",
                included: false
            }

            // This package doesn't work, specifically the reference to `vector_tile.js`, it needs
            // to be fixed, something like the following should work... but doesn't and needs to be
            // investigated.
            // {
            //     pattern: "@here/harp-vectortile-datasource/lib/adapters/omv/proto/vector_tile.js",
            //     included: true
            // },
            //"@here/harp-vectortile-datasource/**/*.ts"

            // This test complains about: Unable to resolve module [original-fs], it should be
            // checked if this test can run in the browser, or not.
            // "@here/harp-map-theme/**/*.ts",
        ],
        exclude: [
            // Files that are to be excluded from the list included above.
            "**/test/rendering/**/*.*",
            "@here/harp-examples/codebrowser.ts",
            "@here/harp-test-utils/lib/rendering/RenderingTestResultServer.ts",
            "@here/harp-test-utils/lib/rendering/RenderingTestResultCli.ts",
            "@here/harp-vectortile-datasource/test/*.ts",
            "@here/harp-datasource-protocol/test/ThemeTypingsTest.ts"
        ],
        proxies: {
            // How to access the local resources, normally this would handled by webpack, but we need to
            // bundle the tests with karma-typescript, so we have to configure where the resources are,
            // by default the resources relative to the root base folder.
            "/@here": "/base/@here",
            "/@here/harp-fontcatalog/resources/":
                "/base/node_modules/@here/harp-fontcatalog/resources/"
        },
        preprocessors: {
            // source files, that you wanna generate coverage for
            // do not include tests or libraries
            // (these files will be instrumented by Istanbul)
            "@here/**/*.ts": ["karma-typescript"]
        },
        // karma-typescript generates a coverage folder
        reporters: ["progress", "karma-typescript"],
        karmaTypescriptConfig: {
            tsconfig: "./tsconfig.json",
            // Don't try to compile the referenced
            compilerOptions: {
                skipLibCheck: true
            },
            coverageOptions: {
                // This is needed otherwise the tests are included in the code coverage %.
                exclude: [/test/]
            },
            reports
        }
    });
};
