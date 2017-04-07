const webpack = require("webpack");

module.exports = {
    entry: {
        test: 'mocha-loader!./test/MapViewDecoderTest.ts'
    },
    output: {
        filename: "./test/browser/[name].bundle.js",
    },
    devtool: 'source-map',
    resolve: {
        extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
    },
    module: {
        loaders: [
            { test: /\.tsx?$/, loader: "ts-loader" }
        ]
    },
};
