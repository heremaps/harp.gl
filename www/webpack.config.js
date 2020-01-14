const fetch = require("node-fetch");
const webpack = require("webpack");
const merge = require("webpack-merge");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");
const ScriptExtHtmlWebpackPlugin = require("script-ext-html-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HTMLInlineCSSWebpackPlugin = require("html-inline-css-webpack-plugin").default;

const commonConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"]
    },
    output: {
        path: path.join(process.cwd(), "dist"),
        filename: "[name].main.js",
        chunkFilename: "[name].chunk.js",
        globalObject: "(self || this)"
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader"]
            },
            {
                test: /\.(png|jpg)$/,
                loader: "file-loader"
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "babel-loader",
                        options: {
                            presets: ["@babel/preset-env"],
                            plugins: [
                                "@babel/plugin-syntax-dynamic-import",
                                "@babel/plugin-proposal-nullish-coalescing-operator"
                            ]
                        }
                    },
                    {
                        loader: "ts-loader",
                        options: {
                            onlyCompileBundledFiles: true,
                            // use the main tsconfig.json for all compilation
                            configFile: path.resolve(__dirname, "./tsconfig.json")
                        }
                    }
                ]
            }
        ]
    },
    plugins: [
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        }),
        new HardSourceWebpackPlugin()
    ],
    performance: {
        hints: false
    },
    mode: process.env.NODE_ENV || "development"
};

const commonPolyfills = [
    // We need some polyfills to be injected, due to usage of restrictive @babel/preset-env usage
    "regenerator-runtime/runtime"
];

const workerPolyfills = [
    ...commonPolyfills,
    // We need to this "polyfill" to load JSONP chunks in worker using `importScripts`
    "./src/WebpackWorkerChunkPolyfill.ts"
];
const mainConfig = merge(commonConfig, {
    entry: {
        index: [...commonPolyfills, "./src/index.ts"],
        decoder: [...workerPolyfills, "./src/decoder.ts"],
        "mapview-worker": [...workerPolyfills, "./src/mapview-worker.ts"]
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: "[name].css",
            chunkFilename: "[id].css"
        }),
        new HtmlWebpackPlugin({
            template: "index.html",
            chunks: ["index", "harp~decoder~index~mapview-worker", "vendors~index~mapview-worker"]
        }),
        new HTMLInlineCSSWebpackPlugin(),
        new ScriptExtHtmlWebpackPlugin({
            defaultAttribute: "defer"
        }),
        new CopyWebpackPlugin([
            "_config.yml",
            {
                from: "./docs",
                to: "docs",
                toType: "dir"
            },
            {
                from: path.resolve(__dirname, "./examples"),
                to: "examples",
                toType: "dir"
            },
            {
                from: "./resources/",
                to: "resources",
                toType: "dir"
            },
            {
                from: "package.json", // dummy path, we ignore input anyway
                to: "releases.json",
                transform: () => {
                    return fetch("https://heremaps.github.io/harp.gl/releases.json").then(res => {
                        return res.text();
                    });
                }
            }
        ])
    ]
});

module.exports = mainConfig;
