const fetch = require("node-fetch");
const webpack = require("webpack");
const merge = require("webpack-merge");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
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
        filename: "[name].bundle.js"
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
                loader: "ts-loader",
                exclude: /node_modules/,
                options: {
                    onlyCompileBundledFiles: true,
                    // use the main tsconfig.json for all compilation
                    configFile: path.resolve(__dirname, "./tsconfig.json")
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
    externals: [
        {
            three: "THREE"
        }
    ],
    performance: {
        hints: false
    },
    mode: process.env.NODE_ENV || "development"
};

const mainConfig = merge(commonConfig, {
    entry: {
        index: "./src/index.ts"
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: "[name].css",
            chunkFilename: "[id].css"
        }),
        new HtmlWebpackPlugin({
            template: "index.html"
        }),
        new HTMLInlineCSSWebpackPlugin(),
        new ScriptExtHtmlWebpackPlugin({
            defaultAttribute: "defer"
        }),
        new CopyWebpackPlugin({
            patterns: [
                require.resolve("three/build/three.min.js"),
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
                        return fetch("https://www.harp.gl/releases.json").then(res => {
                            return res.text();
                        });
                    }
                }
            ]
        })
    ]
});

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./src/decoder.ts"
    }
});
module.exports = [mainConfig, decoderConfig];
