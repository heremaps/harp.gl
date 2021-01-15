/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const webpack = require("webpack");
const { merge } = require("webpack-merge");
const path = require("path");
const glob = require("glob");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const exampleFilter = process.env["FILTER_EXAMPLE"];
const prepareOnly = process.env["PREPARE_ONLY"] === "true";

const harpMapThemePath = path.dirname(require.resolve("@here/harp-map-theme/package.json"));
const harpFontResourcesPath = path.dirname(require.resolve("@here/harp-fontcatalog/package.json"));

const isProduction = process.env.NODE_ENV === "production";
const harpBundleSuffix = isProduction ? ".min" : "";

const themeList = {
    default: "resources/berlin_tilezen_base.json",
    berlinDay: "resources/berlin_tilezen_base.json",
    berlinReducedDay: "resources/berlin_tilezen_day_reduced.json",
    berlinReducedNight: "resources/berlin_tilezen_night_reduced.json",
    berlinStreets: "resources/berlin_tilezen_effects_streets.json",
    berlinOutlines: "resources/berlin_tilezen_effects_outlines.json"
};

function getCacheConfig(name) {
    // Use a separate cache for each configuration, otherwise cache writing fails.
    return process.env.HARP_NO_HARD_SOURCE_CACHE ? false :{
        type: "filesystem",
        buildDependencies: {
            config: [ __filename ]
        },
        name: "harp-examples_" + name
    }
}

function resolveOptional(path, message) {
    try {
        return require.resolve(path);
    } catch (error) {
        if (!message) {
            message = "some examples may not work";
        }
        console.log(`warning: unable to find '${path}': ${message}`);
        return undefined;
    }
}

/** @type{webpack.Configuration} */
const commonConfig = {
    context: __dirname,
    devtool: prepareOnly ? undefined : "source-map",
    externals: [
        {
            three: "THREE"
        },
        ({ context, request }, cb) => {
            return /three\.module\.js$/.test(request)
                ? cb(null, "THREE")
                : cb(undefined, undefined);
        }
    ],
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        alias: {
            "react-native": "react-native-web"
        },
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
                    configFile: path.join(process.cwd(), "tsconfig.json"),
                    onlyCompileBundledFiles: true,
                    transpileOnly: prepareOnly,
                    projectReferences: true,
                    compilerOptions: {
                        sourceMap: !prepareOnly,
                        declaration: false
                    }
                }
            }
        ]
    },
    output: {
        path: path.join(process.cwd(), "dist/examples"),
        filename: "[name].bundle.js"
    },
    performance: {
        hints: false
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
    plugins: [
        new webpack.DefinePlugin({
            THEMES: JSON.stringify(themeList)
        })
    ]
};

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./decoder/decoder.ts"
    },
    // @ts-ignore
    cache: getCacheConfig("decoder")
});

const webpackEntries = glob
    .sync(path.join(__dirname, "./src/*.{ts,tsx}"))
    .reduce((result, entry) => {
        const name = path.basename(entry).replace(/.tsx?$/, "");
        if (name.startsWith("common")) {
            return result;
        }
        result[name] = entry;
        return result;
    }, {});

const htmlEntries = glob.sync(path.join(__dirname, "./src/*.html")).reduce((result, entry) => {
    result[path.basename(entry).replace(/.html$/, "")] = entry;
    return result;
}, {});

function filterExamples(pattern) {
    function filterEntries(entries) {
        Object.keys(entries).forEach(entryName => {
            if (entryName.indexOf(pattern) == -1) {
                delete entries[entryName];
            }
        });
    }
    filterEntries(webpackEntries);
    filterEntries(htmlEntries);
}

// Usage example:
//    FILTER_EXAMPLE=shadows yarn start
//
if (exampleFilter) {
    filterExamples(exampleFilter);
}

const browserConfig = merge(commonConfig, {
    entry: webpackEntries,
    output: {
        filename: "[name]_bundle.js"
    },
    optimization: {
        splitChunks: {
            chunks: "all",
            minSize: 1000,
            name: "common"
        }
    },
    // @ts-ignore
    cache: getCacheConfig("browser")
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts"
    },
    // @ts-ignore
    cache: getCacheConfig("example_browser")
});

const codeBrowserConfig = merge(commonConfig, {
    entry: {
        codebrowser: "./codebrowser.ts"
    },
    // @ts-ignore
    cache: getCacheConfig("code_browser")
});

browserConfig.plugins.push(
    ...Object.keys(browserConfig.entry).map(
        chunk =>
            new HtmlWebpackPlugin({
                template: "template/example.html",
                chunks: ["common", chunk],
                filename: `${chunk}.html`
            })
    )
);

const allEntries = Object.assign({}, webpackEntries, htmlEntries);

/**
 * Geterate example definitions for 'index.html' in following form:
 *
 * {
 *     [examplePage: string]: string // maps example page to example source
 * }
 */
const exampleDefs = Object.keys(allEntries).reduce(function(r, entry) {
    r[entry + ".html"] = path.relative(__dirname, allEntries[entry]);
    return r;
}, {});

// Workaround for `ERROR in unable to locate` on Windows
// see https://github.com/webpack-contrib/copy-webpack-plugin/issues/317
const srcFiles = glob.sync(path.join(__dirname, "src", "*.{ts,tsx,html}")).map(from => {
    return { from, to: "src/[name].[ext]" };
});

const htmlFiles = glob.sync(path.join(__dirname, "src/*.html")).map(from => {
    return {
        from,
        to: "[name].[ext]"
    };
});

const assets = [
    {
        from: __dirname + "/example-definitions.js.in",
        to: "example-definitions.js",
        transform: content => {
            return content.toString().replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, null, 4));
        }
    },
    ...srcFiles,
    path.join(__dirname, "index.html"),
    ...htmlFiles,
    path.join(__dirname, "codebrowser.html"),
    { from: path.join(__dirname, "resources"), to: "resources", toType: "dir" },
    { from: path.join(harpMapThemePath, "resources"), to: "resources", toType: "dir" },
    {
        from: path.join(harpFontResourcesPath, "resources"),
        to: "resources/fonts",
        toType: "dir"
    },
    require.resolve("three/build/three.min.js"),
    {
        from: resolveOptional(
            `@here/harp.gl/dist/harp${harpBundleSuffix}.js`,
            "bundle examples require `yarn build-bundle`"
        ),
        to: "harp.js"
    },
    {
        from: resolveOptional(`@here/harp.gl/dist/harp-decoders${harpBundleSuffix}.js`),
        to: "harp-decoders.js"
    }
].filter(asset => {
    // ignore stuff that is not found
    if (asset === undefined || asset === null) {
        return false;
    } else if (typeof asset === "string") {
        return true;
    } else if (typeof asset === "object") {
        return asset.from;
    }
});

assets.forEach(asset => {
    if (typeof asset === "object") {
        asset.globOptions = {
            dot: true,
            ignore: [".npmignore", ".gitignore"]
        };
    }
});

// @ts-ignore
browserConfig.plugins.push(new CopyWebpackPlugin({ patterns: assets }));

module.exports = [decoderConfig, browserConfig, codeBrowserConfig, exampleBrowserConfig];
