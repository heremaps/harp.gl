/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

const webpack = require("webpack");
const merge = require("webpack-merge");
const path = require("path");
const fs = require("fs");
const glob = require("glob");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');

const prepareOnly = process.env["PREPARE_ONLY"] === "true";

const commonConfig = {
    context: __dirname,
    devtool: prepareOnly ? undefined : "source-map",
    externals: {
        three: "THREE",
        fs: "undefined"
    },
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        alias: {
            'react-native': 'react-native-web'
        }
    },
    module: {
        rules: [{
            test: /\.tsx?$/,
            loader: "ts-loader",
            exclude: /node_modules/,
            options: {
                configFile: path.join(__dirname, "tsconfig.json"),
                onlyCompileBundledFiles: true,
                transpileOnly: prepareOnly,
                compilerOptions: {
                    sourceMap: !prepareOnly
                }
            }
        }]
    },
    output: {
        path: __dirname,
        filename: "dist/[name].bundle.js"
    }
};

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./decoder/decoder.ts"
    }
});

const webpackEntries = glob.sync(path.join(__dirname, "./src/*.{ts,tsx}")).reduce((result, entry) => {
    const name = path.basename(entry).replace(/.tsx?$/, "");
    if (name.startsWith('common')) {
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

// Uncomment and adapt to filter built examples and speed up the build significantly
//
//filterExamples("hello");

const browserConfig = merge(commonConfig, {
    entry: webpackEntries,
    devServer: {
        contentBase: [path.resolve(__dirname, "dist")],
        host: "0.0.0.0",
        disableHostCheck: true
    }
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts"
    }
});

const codeBrowserConfig = merge(commonConfig, {
    entry: {
        codebrowser: "./codebrowser.ts"
    }
});

browserConfig.plugins = Object.keys(browserConfig.entry).map(
    chunk =>
    new HtmlWebpackPlugin({
        template: "template/example.html",
        chunks: ["common_chunks", chunk],
        filename: `dist/${chunk}.html`
    })
);

// move common dependencies to the separate shared chunk
if (process.env.NODE_ENV === "production") {
    browserConfig.plugins.unshift(
        new webpack.optimize.CommonsChunkPlugin({
            name: "common_chunks",
            minChunks: 3
        })
    );
}

const allEntries = Object.assign({}, webpackEntries, htmlEntries);

function resolveExternalPackagePath(id, moduleFilePath) {
    const packaJsonPath = require.resolve(`${id}/package.json`);
    return path.resolve(path.dirname(packaJsonPath), moduleFilePath);
}

/**
 * Generate example definitions for 'index.html' in following form:
 *
 * {
 *     [examplePage: string]: string // maps example page to example source
 * }
 */
const exampleDefs = Object.keys(allEntries).reduce(function (r, entry) {
    r["dist/" + entry + ".html"] = path.relative(__dirname, allEntries[entry]);
    return r;
}, {});

/**
 * Copy all the assets to dist/ folder.
 *
 * `harp-examples` are expected to be served from `dist/`
 */
const assets = [{
        from: __dirname + "/example-definitions.js.in",
        to: "dist/example-definitions.js",
        transform: (content) => {
            return content.toString().replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, true, 4));
        }
    },
    {
        from: "**/*.*",
        context: resolveExternalPackagePath("@here/harp-map-theme", "resources"),
        fromArgs: { follow: true },
        to: "dist/resources",
        toType: "dir"
    },
    {
        from: resolveExternalPackagePath("three", "build/three.min.js"),
        to: "dist/three.min.js"
    },

];

if (process.cwd() !== __dirname) {
    assets.push({
        from: path.join(__dirname, "src/*.{ts,tsx,html}"),
        to: "src/[name].[ext]"
    });
    assets.push({
        from: __dirname + "/resources/*",
        to: "dist/resources/[name].[ext]"
    })
    assets.push({
        from: __dirname + "/{index,codebrowser}.html",
        to: "[name].[ext]"
    })
}

browserConfig.plugins.push(new CopyWebpackPlugin(assets));

module.exports = [decoderConfig, browserConfig, codeBrowserConfig, exampleBrowserConfig];
