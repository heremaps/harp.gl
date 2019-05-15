/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This basically downgrades original webpack.config.js to compile
 * only JS created by `tsc -b .` (in current folder).
 *
 * This is much faster in bigger build process as Typescript runs only once.
 *
 * Usage:

 * - Development

 *    tsc --build tsconfig-build.json --watch --verbose --listEmittedFiles
 *    webpack-dev-server --config webpack-build.config.js
 *
 * - CI
 *    tsc --build tsconfig-build.json
 *    webpack --config webpack-build.config.js
 */
const configs = require('./webpack.config');

module.exports = configs.map(config => {
    config.resolve.extensions = [".webpack.js", ".web.js", ".js"]
    config.module.rules = config.module.rules.filter(rule => rule.loader !== "ts-loader")
    config.module.rules.push({
        rules: [
            {
                test: /\.js$/,
                use: ["source-map-loader"],
                enforce: "pre"
            }
        ]
    })
    for(const entry in config.entries) {
        config.entries[entry] = config.entries[entry].replace(/.ts$/, ".js");
    }
    return config;
})

throw new Foo();
