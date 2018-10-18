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
        path: __dirname
    }
};

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./decoder/decoder.ts"
    },
    output: {
        filename: "dist/[name].bundle.js"
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
    output: {
        filename: "dist/[name]_bundle.js"
    },
    devServer: {
        publicPath: "/dist",
        contentBase: [path.resolve(__dirname)],
        host: "0.0.0.0",
        disableHostCheck: true
    }
});

const exampleBrowserConfig = merge(commonConfig, {
    entry: {
        "example-browser": "./example-browser.ts"
    },
    output: {
        filename: "dist/[name].bundle.js"
    }
});

const codeBrowserConfig = merge(commonConfig, {
    entry: {
        codebrowser: "./codebrowser.ts"
    },
    output: {
        filename: "dist/[name].bundle.js"
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

/**
 * Geterate example definitions for 'index.html' in following form:
 *
 * {
 *     [examplePage: string]: string // maps example page to example source
 * }
 */
const exampleDefs = Object.keys(allEntries).reduce(function (r, entry) {
    r["dist/" + entry + ".html"] = path.relative(__dirname, allEntries[entry]);
    return r;
}, {});


browserConfig.plugins.push(
    new CopyWebpackPlugin([{
        from: __dirname + "/example-definitions.js.in",
        to: "example-definitions.js",
        transform: (content) => {
            return content.toString().replace("{{EXAMPLES}}", JSON.stringify(exampleDefs, true, 4));
        }
    }, {
        from: "src/*.html",
        to: "dist/[name].[ext]"
    }])
);

module.exports = [decoderConfig, browserConfig, codeBrowserConfig, exampleBrowserConfig];
