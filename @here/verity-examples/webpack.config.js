const webpack = require("webpack");
const merge = require("webpack-merge");
const path = require("path");
const fs = require("fs");
const glob = require("glob");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');

// ### figure out a way to disable source-maps on deploy
const isDevelopment = true;

const commonConfig = {
    context: __dirname,
    devtool: isDevelopment ? "source-map" : undefined,
    externals: {
        three: "THREE",
        fs: "undefined"
    },
    resolve: {
        extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
        alias: {
            'react-native': 'react-native-web'
        }
    },
    module: {
        rules: [{
            test: /\.tsx?$/,
            loader: "ts-loader",
            exclude: /node_modules/,
            options: {
                onlyCompileBundledFiles: true,
                transpileOnly: true,
                configFile: path.join(__dirname, "tsconfig.json"),
                compilerOptions: {
                    sourceMap: isDevelopment
                }
            }
        }]
    },
    output: {
        path: __dirname
    }
};

const decoderConfig = merge(commonConfig, {
    target: "webworker",
    entry: {
        decoder: "./decoder/decoder.ts"
    },
    output: {
        filename: "dist/[name].bundle.js"
    }
});

const webpackEntries = glob.sync(path.join(__dirname, "./src/*.{ts,tsx}")).reduce((result, entry) => {
    result[path.basename(entry).replace(/.tsx?$/, "")] = entry;
    return result;
}, {});

const htmlEntries = glob.sync(path.join(__dirname, "./src/*.html")).reduce((result, entry) => {
    result[path.basename(entry).replace(/.html$/, "")] = entry;
    return result;
}, {});


const browserConfig = merge(commonConfig, {
    entry: webpackEntries,
    output: {
        filename: "dist/[name]_bundle.js"
    },
    devServer: {
        publicPath: "/dist",
        contentBase: [path.resolve(__dirname)],
        host: "0.0.0.0",
        disableHostCheck: true
    }
});

const codeBrowserConfig = merge(commonConfig, {
    entry: {
        codebrowser: "./codebrowser.ts"
    },
    output: {
        filename: "dist/[name].bundle.js"
    }
});

browserConfig.plugins = Object.keys(browserConfig.entry).map(
    chunk =>
    new HtmlWebpackPlugin({
        template: "template/example.html",
        chunks: ["common_chunks", chunk],
        filename: `dist/${chunk}.html`
    })
);

// move common dependencies to the separate shared chunk
if (process.env.NODE_ENV === "production") {
    browserConfig.plugins.unshift(
        new webpack.optimize.CommonsChunkPlugin({
            name: "common_chunks",
            minChunks: 3
        })
    );
}

const allEntries = Object.assign({}, webpackEntries, htmlEntries);

/**
 * Geterate files for 'index.html' in following form:
 *
 * {
 *     [section: string]: {
 *        [examplePage: string]: string // maps example page to example source
 *     }
 * }
 */
const files = {
    verity: Object.keys(allEntries).reduce(function(r, entry) {
        r["dist/" + entry + ".html"] = path.relative(__dirname, allEntries[entry]);
        return r;
    },{})
};


browserConfig.plugins.push(
    new CopyWebpackPlugin([{
        from: "./files.js.in",
        to: "files.js",
        transform: (content) => {
            return content.toString().replace("{{FILES}}", JSON.stringify(files, true, 4));
        }
    }, {
        from: "src/*.html",
        to: "dist/[name].[ext]"
    }])
);

module.exports = [decoderConfig, browserConfig, codeBrowserConfig];
