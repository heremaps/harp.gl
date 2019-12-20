/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/*
import * as CopyWebpackPlugin from "copy-webpack-plugin";
import * as HtmlWebpackPlugin from "html-webpack-plugin";
import * as path from "path";
import { Configuration, Plugin } from "webpack";
import * as WebpackMerge from "webpack-merge";
*/
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const { Configuration, Plugin } = require("webpack");
const WebpackMerge = require("webpack-merge");

/*
export type HarpWebpackEntry = string | { [name: string]: string } |  { [name: string]: string[] };

export interface HarpWebpackConfig {
    mainEntry?: HarpWebpackEntry;
    decoderEntry?: HarpWebpackEntry;
    htmlTemplate?: string;
}
export
*/
function addHarpWebpackConfig(
    config /*?: Configuration*/,
    harpConfig /*?: HarpWebpackConfig*/
) /*: Configuration[]*/ {
    if (Array.isArray(config) || typeof config === "function") {
        throw new Error("config passed to addHarpWebpackConfig must be a Configuration object");
    }
    const userConfig = config !== undefined ? config : {};
    const mode = process.env.NODE_ENV === "production" ? "production" : "development";
    const devtool = process.env.PREPARE_ONLY === "true" ? undefined : "source-map";
    const mainEntry = harpConfig === undefined ? undefined : harpConfig.mainEntry;
    const baseConfig /*: Configuration*/ = {
        output: {
            filename: "[name].bundle.js"
        },
        devtool,
        resolve: {
            extensions: [".webpack.js", ".web.js", ".js"]
        },
        performance: {
            hints: false
        },
        mode
    };
    const typescriptConfig /*: Configuration*/ = {
        resolve: {
            extensions: [".web.ts", ".ts", ".tsx"]
        },
        module: {
            rules:
                userConfig.module === undefined || userConfig.module.rules === undefined
                    ? [{ test: /\.tsx?$/, loader: "ts-loader" }]
                    : []
        }
    };
    const mainConfig = isTypescript(mainEntry)
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
        const entry = typeof mainEntry === "string" ? { mapview: mainEntry } : mainEntry;
        bundles[0] = WebpackMerge.smart({ entry }, bundles[0]);
    }
    if (harpConfig !== undefined && harpConfig.decoderEntry !== undefined) {
        const decoderConfig = isTypescript(harpConfig.decoderEntry)
            ? WebpackMerge.smart(baseConfig, typescriptConfig)
            : baseConfig;
        const entry =
            typeof harpConfig.decoderEntry === "string"
                ? { decoder: harpConfig.decoderEntry }
                : harpConfig.decoderEntry;
        bundles.push(
            WebpackMerge.smart(
                {
                    target: "webworker",
                    entry,
                    ...decoderConfig
                },
                userConfig
            )
        );
    }
    return bundles;
}

function createPlugins(htmlTemplate /*?: string*/) /*: Plugin[]*/ {
    const plugins = [
        new CopyWebpackPlugin([
            {
                from: path.join(
                    path.dirname(require.resolve("@here/harp-map-theme/package.json")),
                    "resources"
                ),
                to: "resources",
                toType: "dir"
            }
        ])
    ];
    if (htmlTemplate !== undefined) {
        plugins.push(
            new HtmlWebpackPlugin({
                template: htmlTemplate
            })
        );
    }
    return plugins;
}

function isTypescript(entry /*?: HarpWebpackEntry*/) /*: boolean*/ {
    if (entry === undefined) {
        return false;
    } else if (typeof entry === "string") {
        return entry /* as string*/
            .endsWith(".ts");
    } else {
        return Object.values(entry).some(v =>
            Array.isArray(v) ? Object.values(v).some(w => w.endsWith(".ts")) : v.endsWith(".ts")
        );
    }
}

module.exports = { addHarpWebpackConfig };
