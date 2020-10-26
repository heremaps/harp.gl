/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const fs = require("fs");
const webpack = require("webpack");

const path = require("path");
const merge = require("webpack-merge");

const isProduction = process.env.NODE_ENV === "production";
const bundleSuffix = isProduction ? ".min" : "";

/** @type{webpack.Configuration} */
const commonConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"]
    },
    output: {
        path: path.join(process.cwd(), "dist")
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
                    // configFile: path.join(process.cwd(), "tsconfig.json"),
                    configFile: fs.existsSync("../../tsconfig.json")
                        ? path.resolve(__dirname, "../../tsconfig.json")
                        : path.resolve(__dirname, "./tsconfig.json"),
                    compilerOptions: {
                        declaration: false,
                        declarationMap: false
                    }
                }
            }
        ]
    },
    plugins: [
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        })
    ],
    performance: {
        hints: false
    },
    // @ts-ignore
    mode: process.env.NODE_ENV || "development"
};

const mapComponentConfig = merge(commonConfig, {
    entry: path.resolve(__dirname, "./lib/index.ts"),
    output: {
        filename: `harp${bundleSuffix}.js`,
        library: "harp"
    },
    externals: [
        {
            three: "THREE"
        },
        function(context, request, callback) {
            // @ts-ignore
            return /three\.module\.js$/.test(request) ? callback(null, "THREE") : callback();
        }
    ]
});

const mapComponentDecoderConfig = merge(commonConfig, {
    entry: path.resolve(__dirname, "./lib/DecoderBootstrap.ts"),
    output: {
        filename: `harp-decoders${bundleSuffix}.js`
    },
    externals: [
        {
            three: "THREE"
        },
        function(context, request, callback) {
            // @ts-ignore
            return /three\.module\.js$/.test(request) ? callback(null, "THREE") : callback();
        }
    ]
});

module.exports = [mapComponentConfig, mapComponentDecoderConfig];
