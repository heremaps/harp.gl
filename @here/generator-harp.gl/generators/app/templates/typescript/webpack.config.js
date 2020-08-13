const CopyWebpackPlugin = require("copy-webpack-plugin");
const { addHarpWebpackConfig } = require("@here/harp-webpack-utils/scripts/HarpWebpackConfig");

// this webpack config consists of two generated bundles.
// 1. The bundle that is loaded in the web worker to do background tasks
// 2. The main bundle.

module.exports = addHarpWebpackConfig(
    {
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    require.resolve("three/build/three.min.js"),
                    {
                        from: "resources/",
                        to: "resources/",
                        toType: "dir"
                    }
                ]
            })
        ]
    },
    { mainEntry: "./index.ts", decoderEntry: "./decoder.ts", htmlTemplate: "./index.html" }
);
