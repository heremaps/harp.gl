/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const { options } = require("./karma.options");

/**
 * @param {import("karma").Config} config
 */
module.exports = function(config) {
    config.set({
        ...options,

        // list of files / patterns to load in the browser
        files: [
            "dist/test/three.min.js",
            "test/browser-resources.js",
            "dist/test/test.bundle.js",
            {
                pattern: "@here/**/*.*",
                watched: false,
                included: false
            },
            {
                pattern: "**/harp-fontcatalog/resources/**/*.json",
                watched: false,
                included: false
            }
        ],

        proxies: {
            "/browser/@here": "/base/@here",
            "/browser/@here/harp-fontcatalog/": "/base/node_modules/@here/harp-fontcatalog/"
        }
    });
};
