const webpack = require("webpack");
const glob = require("glob");
const path = require("path");

const browserTestsConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        modules: [".", "node_modules"],
    },
    module: {
        rules: [{
            test: /\.tsx?$/,
            loader: "ts-loader",
            exclude: /node_modules/,
            options: {
                onlyCompileBundledFiles: true,
                // use the main tsconfig.json for all compilation
                configFile: path.resolve(__dirname, "tsconfig.json")
            }
        }]
    },
    entry: {
        test: glob.sync("@here/*/test/**/*.ts")
    },
    output: {
        path: __dirname,
        filename: "dist/test/[name].bundle.js"
    },
    plugins: [
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        })
    ],
    externals: {
        fs: 'undefined',
        three: "THREE",
        typestring: "undefined"
    },
    performance: {
        hints: false
    },
    devServer: {
        contentBase: [path.resolve(__dirname, "test"), path.resolve(__dirname)]
    },
    mode: process.env.NODE_ENV || "development"
};

module.exports = browserTestsConfig;
