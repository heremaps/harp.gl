/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CopyWebpackPlugin from "copy-webpack-plugin";
import * as HtmlWebpackPlugin from "html-webpack-plugin";
import { Configuration, Plugin } from "webpack";
import * as WebpackMerge from "webpack-merge";

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
        mode
    };
    const typescriptConfig: Configuration = {
        resolve: {
            extensions: [".web.ts", ".ts", ".tsx"]
        },
        module: {
            rules: [{ test: /\.tsx?$/, loader: "ts-loader" }]
        }
    };
    const mainConfig =
        mainEntry !== undefined && mainEntry.endsWith(".ts")
            ? WebpackMerge.smart(baseConfig, typescriptConfig)
            : baseConfig;
    const bundles = [
        WebpackMerge.smart(
            {
                ...mainConfig,
                plugins: createPlugins(
                    harpConfig === undefined ? undefined : harpConfig.htmlTemplate
                ),
                stats: {
                    all: false,
                    timings: true,
                    exclude: "/resources/",
                    errors: true,
                    entrypoints: true,
                    warnings: true
                }
            },
            userConfig
        )
    ];
    if (mainEntry !== undefined) {
        bundles[0] = WebpackMerge.smart(
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
            ? WebpackMerge.smart(baseConfig, typescriptConfig)
            : baseConfig;
        bundles.push(
            WebpackMerge.smart(
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

function createPlugins(htmlTemplate?: string): Plugin[] {
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
