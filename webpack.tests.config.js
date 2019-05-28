const webpack = require("webpack");
const glob = require("glob");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HardSourceWebpackPlugin = require("hard-source-webpack-plugin");

const testResourceDirs = glob.sync(path.join(__dirname, "@here/*/test/resources"));
const testResources = testResourceDirs.map(dir => {
    return {
        from: dir,
        to: path.relative(__dirname, dir)
    };
});

const harpFontResourcesPath = path.dirname(
    require.resolve("@here/harp-fontcatalog/package.json")
);

const browserTestsConfig = {
    devtool: "source-map",
    resolve: {
        extensions: [".webpack.js", ".web.ts", ".ts", ".tsx", ".web.js", ".js"],
        modules: [".", "node_modules"]
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
                    configFile: path.resolve(__dirname, "tsconfig.json")
                }
            }
        ]
    },
    entry: {
        test: glob.sync("@here/*/test/**/*.ts")
    },
    output: {
        path: path.join(__dirname, "dist/test"),
        filename: "[name].bundle.js"
    },
    plugins: [
        new HardSourceWebpackPlugin(),
        new webpack.EnvironmentPlugin({
            // default NODE_ENV to development. Override by setting the environment variable NODE_ENV to 'production'
            NODE_ENV: process.env.NODE_ENV || "development"
        }),
        new CopyWebpackPlugin([
            path.join(__dirname, "test/index.html"),
            require.resolve("three/build/three.min.js"),
            require.resolve("mocha/mocha.js"),
            require.resolve("mocha/mocha.css"),
            require.resolve("mocha-webdriver-runner/dist/mocha-webdriver-client.js"),
            ...testResources,
            {
                from: path.join(harpFontResourcesPath, "resources"),
                to: "@here/harp-fontcatalog/resources"
            }
        ])
    ],
    externals: {
        fs: "undefined",
        three: "THREE",
        typestring: "undefined"
    },
    performance: {
        hints: false
    },
    stats: {
        all: false,
        timings: true,
        exclude: "/resources/",
        errors: true,
        entrypoints: true,
        warnings: true
    },
    mode: process.env.NODE_ENV || "development"
};

module.exports = browserTestsConfig;
