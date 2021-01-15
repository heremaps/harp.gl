/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const webpack = require("webpack");
const glob = require("glob");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const testResourceDirs = glob.sync(path.join(__dirname, "@here/*/test/resources"));
const testResources = testResourceDirs.map(dir => {
    return {
        from: dir,
        to: path.relative(__dirname, dir)
    };
});

const harpMapThemePath = path.dirname(require.resolve("@here/harp-map-theme/package.json"));
const harpDataSourceProtocolPath = path.dirname(
    require.resolve("@here/harp-datasource-protocol/package.json")
);
const harpFontResourcesPath = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

const allTests = [
    ...glob.sync("@here/*/test/**/*.ts"),
    ...glob.sync("./test/performance/**/*.ts"),
    ...glob.sync("./test/rendering/*.ts")
];

const unitTests = allTests.filter(
    name => name.indexOf("/rendering") === -1 && name.indexOf("/performance/") === -1
);
const performanceTests = allTests.filter(name => name.indexOf("/performance/") > -1);
const renderingTests = allTests.filter(name => name.indexOf("/rendering/") > -1);

/** @type{webpack.Configuration} */
const browserTestsConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        modules: [__dirname, "node_modules"],
        fallback: {
            fs: false
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: /node_modules/,
                options: {
                    onlyCompileBundledFiles: true,
                    // use the main tsconfig.json for all compilation
                    configFile: path.resolve(__dirname, "tsconfig.json"),
                    transpileOnly: true
                }
            }
        ]
    },
    entry: {
        test: unitTests,
        "performance-test": performanceTests,
        "rendering-test": renderingTests
    },
    output: {
        path: path.join(__dirname, "dist/test"),
        filename: "[name].bundle.js"
    },
    plugins: [
        new ForkTsCheckerWebpackPlugin({}),
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: "development"
        }),
        new webpack.DefinePlugin({
            'process.platform': JSON.stringify(process.platform)
            }),
        new CopyWebpackPlugin({
            patterns: [
                path.join(__dirname, "test/index.html"),
                path.join(__dirname, "test/rendering.html"),
                path.join(__dirname, "test/performance.html"),
                require.resolve("three/build/three.min.js"),
                require.resolve("mocha/mocha.js"),
                require.resolve("mocha/mocha.css"),
                require.resolve("mocha-webdriver-runner/dist/mocha-webdriver-client.js"),
                ...testResources,
                {
                    // DefaultThemeTest is expecting the themes to be in:
                    // http://localhost:8080/@here/harp-map-theme/resources/berlin_*.json
                    // FIXME: CopyWebpackPlugin is not properly handling absolute path on Windows
                    // from: path.join(harpMapThemePath, "resources/berlin*.json"),
                    from: "@here/harp-map-theme/resources/berlin_*.json",
                    toType: "dir"
                },
                {
                    from: path.join(harpMapThemePath, "resources/wests_textures"),
                    to: "resources/wests_textures",
                    toType: "dir"
                },
                {
                    from: path.join(harpDataSourceProtocolPath, "theme.schema.json"),
                    to: "./@here/harp-datasource-protocol",
                    toType: "dir"
                },
                {
                    from: path.join(harpFontResourcesPath, "resources"),
                    to: "@here/harp-fontcatalog/resources"
                },
                {
                    from: "./test/resources/",
                    to: "dist/resources",
                    toType: "dir"
                }
            ]
        })
    ],
    externals: [
        {
            perf_hooks: "undefined",
            three: "THREE",
            typescript: "undefined"
        },
        ({ context, request }, cb) => {
            return /three\.module\.js$/.test(request)
                ? cb(null, "THREE")
                : cb(undefined, undefined);
        }
    ],
    performance: {
        hints: false
    },
    devServer: {
        before: function(app) {
            require("ts-node/register");

            const RenderingTestResultServer = require("./@here/harp-test-utils/lib/rendering/RenderingTestResultServer");
            const basePath = "./rendering-test-results/";
            RenderingTestResultServer.installMiddleware(app, basePath);
        },
        contentBase: "./test/"
    },
    stats: {
        all: false,
        timings: true,
        exclude: "resources/",
        errors: true,
        entrypoints: true,
        warnings: true
    },
    // @ts-ignore
    mode: process.env.NODE_ENV || "development",
    cache: process.env.HARP_NO_HARD_SOURCE_CACHE ? false :{
        type: "filesystem",
        buildDependencies: {
            config: [ __filename ]
        }
    }
};

module.exports = browserTestsConfig;
