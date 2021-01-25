/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// The typings don't yet work for copy-webpack-plugin & webpack 5, hence we ignore them for now,
// see: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/49528
const CopyWebpackPlugin: any = require("copy-webpack-plugin");
// Uncomment this when the above issue is fixed.
// import * as CopyWebpackPlugin from "copy-webpack-plugin";

import * as HtmlWebpackPlugin from "html-webpack-plugin";
import { Configuration, WebpackPluginInstance } from "webpack";
// As above, the typings don't work for webpack-merge, see:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/49757
// const WebpackMerge: any = require("webpack-merge");
// Uncomment this when the above issue is fixed.
// import * as WebpackMerge from "webpack-merge";
import { CustomizeRule, mergeWithRules } from "webpack-merge";

export interface HarpWebpackConfig {
    mainEntry?: string;
    decoderEntry?: string;
    htmlTemplate?: string;
}

export function addHarpWebpackConfig(config?: Configuration, harpConfig?: HarpWebpackConfig) {
    if (Array.isArray(config) || typeof config === "function") {
        throw new Error("config passed to addHarpWebpackConfig must be a Configuration object");
    }
    const userConfig = config !== undefined ? config : {};
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    const mainEntry = harpConfig === undefined ? undefined : harpConfig.mainEntry;
    const WebpackMergeMatchLoader = mergeWithRules({
        module: {
            rules: {
                test: CustomizeRule.Match,
                use: {
                    loader: CustomizeRule.Match,
                    options: CustomizeRule.Merge
                }
            }
        }
    });
    const baseConfig: Configuration = {
        output: {
            filename: "[name].bundle.js"
        },
        devtool: "source-map",
        resolve: {
            extensions: [".webpack.js", ".web.js", ".js"]
        },
        performance: {
            hints: false
        },
        mode,
        externals: {
            three: "THREE"
        }
    };
    const typescriptConfig: Configuration = {
        resolve: {
            extensions: [".web.ts", ".ts", ".tsx"]
        },
        module: {
            rules: [{ test: /\.tsx?$/, loader: "ts-loader" }]
        }
    };

    const mainConfig = mainEntry?.match(/\.tsx?$/)
        ? WebpackMergeMatchLoader(baseConfig, typescriptConfig)
        : baseConfig;

    const bundles = [
        WebpackMergeMatchLoader(
            {
                ...mainConfig,
                plugins: createPlugins(
                    harpConfig === undefined ? undefined : harpConfig.htmlTemplate
                ),
                stats: {
                    all: false,
                    timings: true,
                    exclude: "resources/",
                    errors: true,
                    entrypoints: true,
                    warnings: true
                }
            },
            userConfig
        )
    ];

    if (mainEntry !== undefined) {
        bundles[0] = WebpackMergeMatchLoader(
            {
                entry: {
                    mapview: mainEntry
                }
            },
            bundles[0]
        );
    }
    if (harpConfig !== undefined && harpConfig.decoderEntry !== undefined) {
        const decoderConfig = harpConfig.decoderEntry.endsWith(".ts")
            ? WebpackMergeMatchLoader(baseConfig, typescriptConfig)
            : baseConfig;
        bundles.push(
            WebpackMergeMatchLoader(
                {
                    target: "webworker",
                    entry: {
                        decoder: harpConfig.decoderEntry
                    },
                    ...decoderConfig
                },
                userConfig
            )
        );
    }
    return bundles;
}

function createPlugins(htmlTemplate?: string): WebpackPluginInstance[] {
    const plugins = [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: "node_modules/@here/harp-map-theme/resources",
                    to: "resources",
                    toType: "dir"
                }
            ]
        })
    ];
    if (htmlTemplate !== undefined) {
        plugins.push(
            new HtmlWebpackPlugin({
                template: htmlTemplate
            }) as any
        );
    }
    return plugins;
}
